// Fail = something went wrong; Skip = nothing to do (file left alone on purpose).
class Fail extends Error {}
class Skip extends Error {}
module.exports = { Fail, Skip };
