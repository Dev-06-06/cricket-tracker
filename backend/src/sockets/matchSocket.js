const Match = require('../models/Match');
const { calculateOvers, shouldRotateStrike } = require('../utlis/cricketLogic');
const { updateCareerStats } = require('../utils/statsUpdater');

function setupSockets(io) {
    io.on('connection', (socket) => {
        socket.on('createMatch', async ({ team1Name, team2Name, team1PlayerIds, team2PlayerIds, totalOvers }) => {
            try {
                if (!team1Name || !team2Name) {
                    socket.emit('matchError', { message: 'Team names are required' });
                    return;
                }
                const match = await Match.create({
                    battingTeam: team1Name,
                    bowlingTeam: team2Name,
                    team1Name,
                    team2Name,
                    team1Players: team1PlayerIds || [],
                    team2Players: team2PlayerIds || [],
                    totalOvers: totalOvers || 20,
                    status: 'toss',
                });
                socket.emit('matchCreated', { matchId: match._id });
            } catch (error) {
                console.log('Error creating match:', error);
                socket.emit('matchError', { message: 'Failed to create match' });
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
    });
}

module.exports = setupSockets;