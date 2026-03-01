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
 * @param {number} runs - Total runs scored on the delivery (runsOffBat + extraRuns)
 * @param {boolean} isValidBall - Whether the ball was valid
 * @param {number} totalValidBalls - Total valid balls bowled (used to detect end-of-over)
 * @returns {boolean} Whether strike should rotate
 */
function shouldRotateStrike(runs, isValidBall, totalValidBalls) {
    let strikeRotates = false;

    // Rule A: Odd runs rotate strike (includes extras from wides/no-balls)
    if (runs % 2 === 1) {
        strikeRotates = true;
    }

    // Rule B: Over completion rotation
    if (isValidBall && totalValidBalls % 6 === 0) {
        strikeRotates = !strikeRotates;
    }

    return strikeRotates;
}

module.exports = {
    calculateOvers,
    shouldRotateStrike,
};