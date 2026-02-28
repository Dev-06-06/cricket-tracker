const express = require('express');
const { createMatch, getMatch } = require('../controllers/matchController');

const router = express.Router();

router.post('/', createMatch);
router.get('/:id', getMatch);

module.exports = router;