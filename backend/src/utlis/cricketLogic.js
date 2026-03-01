/**
 * Calculates cricket overs from total valid balls
 * @param {number} totalValidBalls - Total number of valid balls bowled
 * @returns {number} Overs in cricket format (e.g., 1.1 means 1 over and 1 ball)
 */
function calculateOvers(totalValidBalls) {
    const overs = Math.floor(totalValidBalls / 6);
    const balls = totalValidBalls % 6;
    return parseFloat(`${overs}.${balls}`);
}

/**
 * Determines if batters should rotate strike
 * @param {number} runsOffBat - Runs used for odd-run rotation check.
 *   For bye/leg-bye deliveries the caller should include extraRuns in this value.
 *   For wide/no-ball deliveries only the actual bat runs should be passed.
 * @param {string} extraType - Delivery extra type ('none'|'bye'|'leg-bye'|'wide'|'no-ball')
 * @param {number} totalValidBallsAfterThisDelivery - Total valid balls after this delivery
 * @returns {boolean} Whether strike should rotate
 */
function shouldRotateStrike(runsOffBat, extraType, totalValidBallsAfterThisDelivery) {
    const isValidBall = extraType === 'none' || extraType === 'bye' || extraType === 'leg-bye';
    let strikeRotates = false;

    // Rule A: Odd runs rotate strike
    if (runsOffBat % 2 === 1) {
        strikeRotates = true;
    }

    // Rule B: Over completion rotation
    if (isValidBall && totalValidBallsAfterThisDelivery % 6 === 0) {
        strikeRotates = !strikeRotates;
    }

    return strikeRotates;
}

module.exports = {
    calculateOvers,
    shouldRotateStrike,
};