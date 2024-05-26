const axios = require('axios').default;
const axiosRetry = require('axios-retry').default;
const tough = require('tough-cookie');
// const axiosCookieJarSupport = require('axios-cookiejar-support')

// axiosCookieJarSupport(axios);

// const cookieJar = new tough.CookieJar();
// axios.defaults.jar = cookieJar;
// axios.defaults.withCredentials = true;

// axiosRetry(client, {
//     retries: 3,
//     retryDelay: axiosRetry.exponentialDelay,
//     retryCondition: (error) => {
//         return error.code === 'ETIMEDOUT';
//     }
// });

const iaxios = axios;

module.exports = {
    iaxios
};
