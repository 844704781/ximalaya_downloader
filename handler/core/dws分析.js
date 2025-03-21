/**
 * 1258
 *
 */
this[z(1344)] = function (n, t, v) {
    var a = z;
    let u = this;
    var f, o, e, s, h, r = this[a(543)], c = this[a(1356)](n), n = this[a(454)](n);
    null != r && null != n && null != c && (f = a(1291) + r + n,
        //构建数字联盟请求需要的数据
        o = this[a(1151)](t, c),
        e = 0,
        s = 1,
        (h = function () {
                var r = a
                    , i = new XMLHttpRequest;
                i[r(1432)](r(586), f, !0),
                    i[r(952)] = function () {
                        e < s ? (e++,
                            i[r(1329)](),
                            h()) : v({
                            err: 1,
                            cadd: null,
                            sid: null
                        })
                    }
                    ,
                    i[r(1011)] = function () {
                        v({
                            err: 1,
                            cadd: null,
                            sid: null
                        })
                    }
                    ,
                    i[r(545)] = function () {
                        var n, t = r;
                        4 == i[t(920)] && (200 == i[t(677)] && (n = i[t(748)],
                            n = u[t(1330)](n, c)) ? (t = JSON[t(1299)](n),
                            v(t)) : v({
                            err: 1,
                            cadd: null,
                            sid: null
                        }))
                    }
                    ,
                    i[r(553)] = 1e3,
                    //发送数字联盟请求
                    i[r(587)](o)
            }
        )())
}

//base64toArrayBufferœœ
this[z(1151)] = function(n, t) {
    var r = z
        , n = this[r(1262)](c[r(727)](n, 0))
        , n = this[r(948)](n)
        , n = Jcr[r(1077)][r(1187)][r(878)](n[r(1294)])
        , n = this[r(1112)](n, t);
    return this[r(408)](n)
}

i[r(545)] = function () {
    var n, t = r;
    // i[7(748)]
    /**
     * 从这里获取一串加密数据
     * "https://hdaa.shuzilm.cn/report?v=1.1.0&e=1&c=1"
     */
    4 == i[t(920)] && (200 == i[t(677)] && (n = i[t(748)],
        n = u[t(1330)](n, c)) ?
        (t = JSON[t(1299)](n), v(t)) :
        v({
            err: 1,
            cadd: null,
            sid: null
        }))
}

this[z(1330)] = function (n, t) {
    var r = z;
    if (n && t)
        try {
            //AE解码得到一串字节数字
            var i = this[r(1401)](n, t);
            //判断长度是否小于0
            if (i[r(462)] <= 0)
                return null;
            //转十六进制数字数组v
            for (var v = [], a = 0; a < i[r(462)]; a += 2)
                v[r(694)](parseInt(i[r(740)](a, 2), 16));
            //返回解密后的xm-sign
            return this[r(497)](v)
        } catch (n) {
        }
    return null
}


this[z(1401)] = function (n, t) {
    var r = z;
    try {
        /**
         * i就是iv
         *
         * 值是：
         */
            // {
            //     "words": [
            //     980571443,
            //     909983834,
            //     980571443,
            //     909983834
            // ],
            //     "sigBytes": 16
            // }
        var i = Jcr[r(772)][r(531)][r(1299)](t);
        //调用AES的decrypt方法
        return Jcr[r(364)][r(913)](n, i, {
            iv: i,
            mode: Jcr[r(917)][r(1321)],
            padding: Jcr[r(426)][r(1364)]
        })[r(1280)]()
    } catch (n) {
        return null
    }
}

//AES的decrypt方法
decrypt: function (n, t, r) {
    var i = a0_0x5390;
    return x(t)[i(913)](v, n, t, r)
}

//AES的decrypt方法
decrypt: function (n, t, r, i) {
    var v = f;
    return i = this[v(1105)][v(500)](i),
        t = this[v(715)](t, i[v(1043)]),
        n[v(988)](r, i)[v(1132)](t[v(682)])
}
,

//AES的decrypt方法
parse: function (n) {
    var t, r = f, n = v[r(1299)](n), i = n[r(977)];
    return 1398893684 == i[0] && 1701076831 == i[1] && (t = o[r(878)](i[r(1088)](2, 4)),
        i[r(692)](0, 4),
        n[r(930)] -= 16),
        h[r(878)]({
            ciphertext: n,
            salt: t
        })
}

create: function () {
    var n = a0_0x5390
        , t = this[n(500)]();
    return t[n(376)][n(970)](t, arguments),
        t
}
,