const Match = require('../models/Match');
const Player = require('../models/Player');
const { calculateOvers, shouldRotateStrike } = require('../utlis/cricketLogic');
const { updateCareerStats } = require('../utils/statsUpdater');

const emptyBatting = () => ({ runs: 0, balls: 0, fours: 0, sixes: 0, dismissalType: '' });

const isValidBallType = (extraType) =>
    extraType === 'none' || extraType === 'bye' || extraType === 'leg-bye';

async function emitMatchState(target, matchId) {
    const match = await Match.findById(matchId)
        .populate('team1Players', 'name')
        .populate('team2Players', 'name');
    if (!match) return;

    const storedStats = {};
    (match.playerStats || []).forEach((ps) => {
        const batting = ps.batting
            ? { runs: ps.batting.runs, balls: ps.batting.balls, fours: ps.batting.fours, sixes: ps.batting.sixes, dismissalType: ps.batting.dismissalType }
            : emptyBatting();
        storedStats[String(ps.playerId)] = { didBat: ps.didBat, didBowl: ps.didBowl, isOut: ps.isOut, batting };
    });

    // Compute bowling stats by bowler name from timeline
    const bowlingByName = {};
    (match.timeline || []).forEach((ball) => {
        const bowler = ball.bowler;
        if (!bowler) return;
        if (!bowlingByName[bowler]) bowlingByName[bowler] = { balls: 0, runs: 0, wickets: 0 };
        const isValid = isValidBallType(ball.extraType);
        if (isValid) bowlingByName[bowler].balls++;
        if (ball.extraType !== 'wide' && ball.extraType !== 'no-ball') {
            bowlingByName[bowler].runs += ball.runsOffBat || 0;
        }
        bowlingByName[bowler].runs += ball.extraRuns || 0;
        if (ball.isWicket) bowlingByName[bowler].wickets++;
    });

    const playerStats = [
        ...match.team1Players.map((p) => ({
            _id: p._id,
            name: p.name,
            team: match.team1Name,
            ...(storedStats[String(p._id)] || {}),
            bowling: bowlingByName[p.name] || { balls: 0, runs: 0, wickets: 0 },
        })),
        ...match.team2Players.map((p) => ({
            _id: p._id,
            name: p.name,
            team: match.team2Name,
            ...(storedStats[String(p._id)] || {}),
            bowling: bowlingByName[p.name] || { balls: 0, runs: 0, wickets: 0 },
        })),
    ];

    // Transform timeline entries for frontend consumption
    const timeline = (match.timeline || []).map((ball) => {
        const isValidBall = isValidBallType(ball.extraType);
        const extType = ball.extraType !== 'none' ? ball.extraType : null;
        const extras = extType
            ? { type: extType === 'no-ball' ? 'noBall' : extType, runs: ball.extraRuns || 0 }
            : null;
        return {
            ...ball.toObject(),
            runs: ball.runsOffBat,
            isValidBall,
            extras,
        };
    });

    target.emit('matchState', {
        ...match.toObject(),
        playerStats,
        timeline,
        striker: match.currentStriker || null,
        nonStriker: match.currentNonStriker || null,
    });
}

function setupSockets(io) {
    io.on('connection', (socket) => {
        socket.on('createMatch', async ({ team1Name, team2Name, team1PlayerIds, team2PlayerIds, totalOvers }) => {
            try {
                if (!team1Name || !team2Name) {
                    socket.emit('matchError', { message: 'Team names are required' });
                    return;
                }

                const playerStats = [];
                const t1Players = await Player.find({ _id: { $in: team1PlayerIds || [] } });
                t1Players.forEach((p) => playerStats.push({ playerId: p._id, name: p.name, team: team1Name, didBat: false, didBowl: false }));
                const t2Players = await Player.find({ _id: { $in: team2PlayerIds || [] } });
                t2Players.forEach((p) => playerStats.push({ playerId: p._id, name: p.name, team: team2Name, didBat: false, didBowl: false }));

                const match = await Match.create({
                    battingTeam: team1Name,
                    bowlingTeam: team2Name,
                    team1Name,
                    team2Name,
                    team1Players: team1PlayerIds || [],
                    team2Players: team2PlayerIds || [],
                    totalOvers: totalOvers || 20,
                    status: 'toss',
                    playerStats,
                });
                socket.emit('matchCreated', { matchId: match._id });
                await emitMatchState(socket, match._id);
            } catch (error) {
                console.log('Error creating match:', error);
                socket.emit('matchError', { message: 'Failed to create match' });
            }
        });

        socket.on('joinMatch', async ({ matchId }) => {
            socket.join(matchId);
            await emitMatchState(socket, matchId);
        });

        socket.on('tossResult', async ({ matchId, tossWinner, tossChoice }) => {
            try {
                const match = await Match.findById(matchId);
                if (!match) return;

                match.tossWinner = tossWinner;
                match.tossChoice = tossChoice;

                if (tossChoice === 'BAT') {
                    match.battingTeam = tossWinner;
                    match.bowlingTeam = tossWinner === match.team1Name ? match.team2Name : match.team1Name;
                } else {
                    match.bowlingTeam = tossWinner;
                    match.battingTeam = tossWinner === match.team1Name ? match.team2Name : match.team1Name;
                }

                match.status = 'innings';
                await match.save();
                await emitMatchState(io.to(matchId), matchId);
            } catch (error) {
                console.log('Error handling tossResult:', error);
            }
        });

        socket.on('setOpeners', async ({ matchId, striker, nonStriker, bowler }) => {
            try {
                const match = await Match.findById(matchId);
                if (!match) return;

                match.currentStriker = striker;
                match.currentNonStriker = nonStriker;
                match.currentBowler = bowler;
                match.status = 'live';

                match.playerStats.forEach((ps) => {
                    if (ps.name === striker || ps.name === nonStriker) {
                        ps.didBat = true;
                    }
                    if (ps.name === bowler) {
                        ps.didBowl = true;
                    }
                });

                await match.save();

                await emitMatchState(io.to(matchId), matchId);
            } catch (error) {
                console.log('Error handling setOpeners:', error);
            }
        });

        socket.on('join_match', (matchId) => {
            socket.join(matchId);
            console.log(`Socket ${socket.id} joined match ${matchId}`);
        });

        socket.on('umpire_update', async ({ matchId, deliveryData }) => {
            try {
                const match = await Match.findById(matchId);
                const { dismissedBatter } = deliveryData;

                const enrichedDelivery = { ...deliveryData, striker: match.currentStriker || '', bowler: match.currentBowler || '' };
                match.timeline.push(enrichedDelivery);
                match.totalRuns += deliveryData.runsOffBat + deliveryData.extraRuns;

                // Update per-batter batting stats for the current striker
                const isValidBall = isValidBallType(deliveryData.extraType);
                if (match.currentStriker) {
                    const strikerPs = match.playerStats.find((p) => p.name === match.currentStriker);
                    if (strikerPs) {
                        if (!strikerPs.batting) strikerPs.batting = emptyBatting();
                        if (deliveryData.extraType !== 'wide') {
                            strikerPs.batting.runs += deliveryData.runsOffBat;
                            if (deliveryData.runsOffBat === 4) strikerPs.batting.fours += 1;
                            if (deliveryData.runsOffBat === 6) strikerPs.batting.sixes += 1;
                        }
                        if (isValidBall) strikerPs.batting.balls += 1;
                    }
                }

                if (deliveryData.isWicket) {
                    match.wickets += 1;
                    if (dismissedBatter) {
                        const ps = match.playerStats.find((p) => p.name === dismissedBatter);
                        if (ps) {
                            ps.isOut = true;
                            ps.dismissalType = deliveryData.wicketType;
                        }
                        if (dismissedBatter === match.currentStriker) {
                            match.currentStriker = null;
                        } else if (dismissedBatter === match.currentNonStriker) {
                            match.currentNonStriker = null;
                        }
                    }
                    match.status = 'innings';
                }

                let totalValidBalls = match.ballsBowled || 0;
                
                if (isValidBall) {
                    totalValidBalls += 1;
                }

                if (!deliveryData.isWicket && shouldRotateStrike(deliveryData.runsOffBat, isValidBall, totalValidBalls)) {
                    [match.currentStriker, match.currentNonStriker] = [match.currentNonStriker, match.currentStriker];
                }

                match.oversBowled = calculateOvers(totalValidBalls);
                match.ballsBowled = totalValidBalls;

                await match.save();
                await emitMatchState(io.to(matchId), matchId);
            } catch (error) {
                console.log(error);
            }
        });

        socket.on('delivery', async ({ matchId, runs, extraType, extraRuns, isWicket, wicketType, dismissedBatter }) => {
            try {
                const match = await Match.findById(matchId);
                if (!match) { socket.emit('error', { message: 'Match not found' }); return; }

                const normalizedExtraType = extraType === 'noBall' ? 'no-ball' : (extraType || 'none');
                const isValidBall = isValidBallType(normalizedExtraType);

                const entry = {
                    runsOffBat: Number(runs) || 0,
                    extraType: normalizedExtraType,
                    extraRuns: Number(extraRuns) || 0,
                    isWicket: Boolean(isWicket),
                    wicketType: isWicket && wicketType ? wicketType : 'none',
                    batterDismissed: isWicket && dismissedBatter ? dismissedBatter : '',
                    striker: match.currentStriker || '',
                    bowler: match.currentBowler || '',
                };

                match.timeline.push(entry);
                match.totalRuns += entry.runsOffBat + entry.extraRuns;

                // Update batter stats
                if (match.currentStriker) {
                    const strikerPs = match.playerStats.find((p) => p.name === match.currentStriker);
                    if (strikerPs) {
                        if (!strikerPs.batting) strikerPs.batting = emptyBatting();
                        if (normalizedExtraType !== 'wide') {
                            strikerPs.batting.runs += entry.runsOffBat;
                            if (entry.runsOffBat === 4) strikerPs.batting.fours += 1;
                            if (entry.runsOffBat === 6) strikerPs.batting.sixes += 1;
                        }
                        if (isValidBall) strikerPs.batting.balls += 1;
                    }
                }

                if (isWicket) {
                    match.wickets += 1;
                    if (dismissedBatter) {
                        const ps = match.playerStats.find((p) => p.name === dismissedBatter);
                        if (ps) {
                            ps.isOut = true;
                            if (!ps.batting) ps.batting = emptyBatting();
                            ps.batting.dismissalType = wicketType || '';
                        }
                        if (dismissedBatter === match.currentStriker) {
                            match.currentStriker = null;
                        } else if (dismissedBatter === match.currentNonStriker) {
                            match.currentNonStriker = null;
                        }
                    }
                }

                let totalValidBalls = match.ballsBowled || 0;
                if (isValidBall) totalValidBalls += 1;

                if (!isWicket && shouldRotateStrike(entry.runsOffBat, isValidBall, totalValidBalls)) {
                    [match.currentStriker, match.currentNonStriker] = [match.currentNonStriker, match.currentStriker];
                }

                match.oversBowled = calculateOvers(totalValidBalls);
                match.ballsBowled = totalValidBalls;

                await match.save();
                await emitMatchState(io.to(matchId), matchId);
            } catch (error) {
                console.error('Error handling delivery:', error);
                socket.emit('error', { message: 'Failed to record delivery' });
            }
        });

        socket.on('complete_match', async ({ matchId }) => {
            try {
                const match = await Match.findById(matchId);

                if (!match) {
                    return;
                }

                match.status = 'completed';
                await match.save();

                await updateCareerStats(match);

                io.to(matchId).emit('match_completed', match);
            } catch (error) {
                console.log(error);
            }
        });

        socket.on('undo_delivery', async ({ matchId }) => {
            try {
                const match = await Match.findById(matchId);

                if (match.timeline.length === 0) {
                    return;
                }

                match.timeline.pop();

                match.totalRuns = 0;
                match.timeline.forEach(delivery => {
                    match.totalRuns += delivery.runsOffBat + delivery.extraRuns;
                });

                match.wickets = match.timeline.filter(delivery => delivery.isWicket).length;

                const validBalls = match.timeline.filter(delivery => 
                    delivery.extraType === 'none' || delivery.extraType === 'bye' || delivery.extraType === 'leg-bye'
                ).length;
                match.oversBowled = calculateOvers(validBalls);
                match.ballsBowled = validBalls;

                // Rebuild per-batter batting stats from remaining timeline
                match.playerStats.forEach((ps) => {
                    if (ps.batting) {
                        ps.batting.runs = 0;
                        ps.batting.balls = 0;
                        ps.batting.fours = 0;
                        ps.batting.sixes = 0;
                        ps.batting.dismissalType = '';
                    }
                });
                match.timeline.forEach((delivery) => {
                    if (delivery.striker) {
                        const strikerPs = match.playerStats.find((p) => p.name === delivery.striker);
                        if (strikerPs) {
                            if (!strikerPs.batting) strikerPs.batting = emptyBatting();
                            const isValid = delivery.extraType === 'none' || delivery.extraType === 'bye' || delivery.extraType === 'leg-bye';
                            if (delivery.extraType !== 'wide') {
                                strikerPs.batting.runs += delivery.runsOffBat;
                                if (delivery.runsOffBat === 4) strikerPs.batting.fours += 1;
                                if (delivery.runsOffBat === 6) strikerPs.batting.sixes += 1;
                            }
                            if (isValid) strikerPs.batting.balls += 1;
                        }
                    }
                    if (delivery.isWicket && delivery.batterDismissed) {
                        const dismissedPs = match.playerStats.find((p) => p.name === delivery.batterDismissed);
                        if (dismissedPs && dismissedPs.batting) {
                            dismissedPs.batting.dismissalType = delivery.wicketType || '';
                        }
                    }
                });

                await match.save();

                io.to(matchId).emit('score_updated', match);
            } catch (error) {
                console.log(error);
            }
        });

        socket.on('setNewBatter', async ({ matchId, batter }) => {
            try {
                const match = await Match.findById(matchId);
                if (!match) return;

                match.currentStriker = batter;
                match.status = 'live';

                match.playerStats.forEach((ps) => {
                    if (ps.name === batter) {
                        ps.didBat = true;
                    }
                });

                await match.save();
                await emitMatchState(io.to(matchId), matchId);
            } catch (error) {
                console.log('Error handling setNewBatter:', error);
            }
        });

        socket.on('setNewBowler', async ({ matchId, bowler }) => {
            try {
                const match = await Match.findById(matchId);
                if (!match) return;

                match.currentBowler = bowler;

                match.playerStats.forEach((ps) => {
                    if (ps.name === bowler) {
                        ps.didBowl = true;
                    }
                });

                await match.save();
                await emitMatchState(io.to(matchId), matchId);
            } catch (error) {
                console.log('Error handling setNewBowler:', error);
            }
        });
    });
}

module.exports = setupSockets;