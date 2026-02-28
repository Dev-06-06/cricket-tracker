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
 * @param {number} runsOffBat - Runs scored off the bat
 * @param {boolean} isValidBall - Whether the ball was valid
 * @param {number} currentValidBallsInOver - Valid balls in current over (0-5)
 * @returns {boolean} Whether strike should rotate
 */
function shouldRotateStrike(runsOffBat, isValidBall, currentValidBallsInOver) {
    let strikeRotates = false;

    // Rule A: Odd runs rotate strike
    if (runsOffBat % 2 === 1) {
        strikeRotates = true;
    }

    // Rule B: Over completion rotation
    if (isValidBall && currentValidBallsInOver === 6) {
        strikeRotates = !strikeRotates;
    }

    return strikeRotates;
}

module.exports = {
    calculateOvers,
    shouldRotateStrike,
};