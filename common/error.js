class CustomError extends Error {
    constructor(code, message) {
        super();
        this.code = code;
        this.message = message;
    }
}

module.exports = {
    CustomError
};
