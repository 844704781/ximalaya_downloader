import CryptoJS from 'crypto-js'

function getSoundCryptLink(ciphertext) {
    const key = CryptoJS.enc.Hex.parse('aaad3e4fd540b0f79dca95606e72bf93');
    const encrypted = CryptoJS.enc.Base64url.parse(ciphertext);
    const decrypted = CryptoJS.AES.decrypt({ciphertext: encrypted}, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
}

let headers = {
    'Connection': 'keep-alive',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'zh-CN',
    //'Cookie': 'channel=99;1&_device=darwin&24c60e8a-6a6d-51a2-af64-7613fb39a4ef&4.0.2;v1=1!?uR72$3r=zY.7us#be;1&remember_me=y;1&_token=38899032&12901320140CE5DA8A46A3CCD877A99663E25DEAE98F938B84DAC8078CF269E16363316BFF3A234Mcadf63e29812950_;1_l_flag=38899032&12901320140CE5DA8A46A3CCD877A99663E25DEAE98F938B84DAC8078CF269E16363316BFF3A234Mcadf63e29812950__2024-05-1815:47:48;',
    'Cookie':'_xmLog=h5%2685125320-3c87-43c0-8228-f43734d4bddf%262.4.15-alpha.2; remember_me=y; _token=38899032%2612901320140CE5DA8A46A3CCD877A99663E25DEAE98F938B84DAC8078CF269E16363316BFF3A234Mcadf63e29812950_; wfp=ACM4MzBmMDg3ODg2OTc4NmRho0-cwtmso-54bXdlYl93d3c; xm-page-viewid=ximalaya-web; impl=www.ximalaya.com.login; x_xmly_traffic=utm_source%253A%2526utm_medium%253A%2526utm_campaign%253A%2526utm_content%253A%2526utm_term%253A%2526utm_from%253A; Hm_lvt_4a7d8ec50cfd6af753c4f8aee3425070=1715781066,1715830002,1715931095,1716018268; web_login=1716021312302; Hm_lpvt_4a7d8ec50cfd6af753c4f8aee3425070=1716021312; _device=darwin; device_id=24c60e8a-6a6d-51a2-af64-7613fb39a4ef; device_version=4.0.2; v1=1!?uR72$3r=zY.7us#be; _l_flag=38899032%2612901320140CE5DA8A46A3CCD877A99663E25DEAE98F938B84DAC8078CF269E16363316BFF3A234Mcadf63e29812950__2024-05-1815:47:48',
    'Origin': 'https://www.ximalaya.com',
    'Referer': 'https://www.ximalaya.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ????/4.0.2 Chrome/102.0.5005.167 Electron/19.1.1 Safari/537.36 4.0.2',
    'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="102"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"'
};
//
// axios.get('https://www.ximalaya.com/mobile-playpage/track/v3/baseInfo/1716018624931?device=mac&trackId=481936665&trackQualityLevel=2', { headers })
//     .then(response => {
//         console.log(response.data);
//     })
//     .catch(error => {
//         console.error(error);
//     });


// 示例调用
// const encryptedText = 'pX7rCko1ZPLJXbyU3qjcDqAp042BK5yCrhhNlUZEBd6lHKILemhbvHD1YkhQ7FDbx5ImRKLBpdEfxVdUwFk7Dc1iXpKk7HDKgut7dVMDp-xCTTzZJf810zt6p4H6p038BV-DBnDSr0-7UYcSEj1moeeAhvsKOzj0WnTrM7PRs34GiKZqRCXdhHQF5irW1QNXkcbEncyXlUBJ2fAhk6BUVG_pp9Vb9GgSgezuKF1AZhNXPTFqaoPmYjzsEDqxg9oyjspEzNrFPMlKi3AxQ-E5-fnGjlgdL6UnVQzOTe5K-1Q';
// const decryptedText = www2Decrypt(encryptedText);
// console.log(decryptedText);


export const decrypt={
    getSoundCryptLink
}