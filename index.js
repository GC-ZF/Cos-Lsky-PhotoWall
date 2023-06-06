const express = require('express');
const axios = require('axios');
const COS = require('cos-nodejs-sdk-v5');
const app = express();
const port = 3000; // 端口号

// start 配置
// 腾讯云存储配置
const cos_domain = process.env['cos_domain']; // 存储桶自定义域名
// SECRETID 和 SECRETKEY，请登录 https://console.cloud.tencent.com/cam/capi 进行查看和管理
const cos = new COS({
    SecretId: process.env['cos_SecretId'],
    SecretKey: process.env['cos_SecretKey'],
});
const cos_bucket = process.env['cos_bucket']; // 存储桶名称
const cos_region = process.env['cos_region']; // 存储桶地域
const cos_prefix = process.env['cos_prefix']; // 文件夹路径，默认全部
// 兰空配置
const lsky_domain = process.env['lsky_domain']; // 兰空域名
const myHeaders = {
    'Authorization': process.env['lsky_token'], // 兰空token
    'Accept': 'application/json'
};
const requestOptions = {
    headers: myHeaders
};
//公共配置
const exclude = process.env['exclude']; // 要排除的图片路径列表
// 跨域配置 Access-Control-Allow-Origin 允许所有域名 可以配置仅自己域名
app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', '*');
    res.header('Content-Type', 'application/json;charset=utf-8');
    next();
});
// end 配置结束
app.get('/cos', (req, res) => {
    cos.getBucket({
        // 存储桶名称
        Bucket: cos_bucket,
        // 存储桶所在地域
        Region: cos_region,
        // 非必须，文件夹路径，默认全部
        Prefix: cos_prefix,
    }).then(data => {
        // 处理拼接图片信息到photo_list filter过滤文件后缀
        const photo_list = data.Contents
            .filter(item => /\.(jpg|png|webp)$/.test(item.Key) && !exclude.includes(item.Key))
            .map(item => ({
                img: `https://${cos_domain}/` + item.Key, // COS自定义cdn地址
                title: item.Key.match(/([^/]+)\.\w+$/)[1],
                time: item.LastModified.replace(/[TZ]/g, ' ').slice(0, -5)
            }));
        // 较新时间放在前
        photo_list.reverse();
        res.json(photo_list);
    }).catch(error => {
        console.log('error', error);
        res.status(500).json({error: 'An error occurred'});
    });
});

function getImages() {
    return axios.get(`http://${lsky_domain}/api/v1/images`, requestOptions)
        .then(response => response.data)
        .then(result => {
            const page_num = result.data.last_page; // 获取页码
            return fetchPhotos(page_num);
        })
        .catch(error => {
            console.log('error', error);
            throw error;
        });
}

function fetchPhotos(page_num) {
    // 需要遍历的页码
    const urls = [];
    for (let i = 1; i <= page_num; i++) {
        urls.push(`http://${lsky_domain}/api/v1/images?page=${i}`);
    }

    const data = {};
    const photo_list = []; // 保存每页的图片信息

    return Promise.all(urls.map(url =>
        axios.get(url, requestOptions)
            .then(response => response.data)
            .then(result => {
                data[result.data.current_page] = result.data.data;
            })
    )).then(() => {
        //按页码保存图片信息到photo_list
        for (let i = 1; i <= page_num; i++) {
            photo_list.push(
                ...data[i]
                    .filter(item => !exclude.includes(item.pathname))
                    .map(item => ({
                        img: item.links.url,
                        title: item.name.match(/^(.*)\.(webp|png|jpg)$/)[1],
                        time: item.date
                    }))
            );
        }
        return photo_list;
    });
}

app.get('/lsky', (req, res) => {
    getImages()
        .then(photo_list => {
            res.json(photo_list);
            // res.send(photo_list)
        })
        .catch(error => {
            res.status(500).json({error: 'Internal Server Error'});
        });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
