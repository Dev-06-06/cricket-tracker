const Match = require('../models/Match');
const Player = require('../models/Player');
const { calculateOvers, shouldRotateStrike } = require('../utlis/cricketLogic');
const { updateCareerStats } = require('../utils/statsUpdater');

async function emitMatchState(target, matchId) {
    const match = await Match.findById(matchId)
        .populate('team1Players', 'name')
        .populate('team2Players', 'name');
    if (!match) return;

    const storedStats = {};
    (match.playerStats || []).forEach((ps) => {
        storedStats[String(ps.playerId)] = { didBat: ps.didBat, didBowl: ps.didBowl };
    });

    const playerStats = [
        ...match.team1Players.map((p) => ({ _id: p._id, name: p.name, team: match.team1Name, ...(storedStats[String(p._id)] || {}) })),
        ...match.team2Players.map((p) => ({ _id: p._id, name: p.name, team: match.team2Name, ...(storedStats[String(p._id)] || {}) })),
    ];

    target.emit('matchState', {
        ...match.toObject(),
        playerStats,
        striker: match.currentStriker || null,
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
                    if (String(ps.playerId) === String(striker) || String(ps.playerId) === String(nonStriker)) {
                        ps.didBat = true;
                    }
                    if (String(ps.playerId) === String(bowler)) {
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

                match.timeline.push(deliveryData);
                match.totalRuns += deliveryData.runsOffBat + deliveryData.extraRuns;

                if (deliveryData.isWicket) {
                    match.wickets += 1;
                }

                const isValid = deliveryData.extraType === 'none' || deliveryData.extraType === 'bye' || deliveryData.extraType === 'leg-bye';
                let totalValidBalls = match.ballsBowled || 0;
                
                if (isValid) {
                    totalValidBalls += 1;
                }

                if (shouldRotateStrike(deliveryData.runsOffBat, isValid, totalValidBalls)) {
                    [match.currentStriker, match.currentNonStriker] = [match.currentNonStriker, match.currentStriker];
                }

                match.oversBowled = calculateOvers(totalValidBalls);
                match.ballsBowled = totalValidBalls;

                await match.save();

                io.to(matchId).emit('score_updated', match);
            } catch (error) {
                console.log(error);
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

                match.playerStats.forEach((ps) => {
                    if (String(ps.playerId) === String(batter)) {
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
                    if (String(ps.playerId) === String(bowler)) {
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