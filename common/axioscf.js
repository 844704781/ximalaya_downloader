const axios = require('axios');
const axiosRetry = require('axios-retry').default;

axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        return error.code === 'ETIMEDOUT';
    }
});

const iaxios = axios;

module.exports = {
    iaxios
};
