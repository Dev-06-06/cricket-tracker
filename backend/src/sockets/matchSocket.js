const { Match } = require('../models/Match');
const { calculateOvers, shouldRotateStrike } = require('../utils/cricketLogic');

function setupSockets(io) {
    io.on('connection', (socket) => {
        socket.on('join_match', (matchId) => {
            socket.join(matchId);
            console.log(`Socket ${socket.id} joined match ${matchId}`);
        });

        socket.on('umpire_update', async ({ matchId, deliveryData }) => {
            try {
                const match = await Match.findById(matchId);

                match.timeline.push(deliveryData);
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
                match.totalRuns += deliveryData.runsOffBat + deliveryData.extraRuns;

                if (deliveryData.isWicket) {
                    match.wickets += 1;
                }

                const isValid = !deliveryData.isWide && !deliveryData.isNoBall;
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
    });
}

module.exports = setupSockets;

module.exports = setupSockets;