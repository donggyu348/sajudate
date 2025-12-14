export default {

    local: {
         username: 'root',
         password: 'jyo07069!@#',
         database: 'dblocal',
         host: '127.0.0.1',
         port: 3306,
       // username: 'dbmasteruser',
       // password: ':9p}jU,,Qs6PGaeur)nuVX#h}+Y{7!Al',
        //database: 'dbmaster',
       // host: '127.0.0.1',
       // port: 3307,
        dialect: "mysql",
        timezone: "+09:00",
        // logging: false,
        // NOTE : 쿼리 보고싶을때만 사용
        logging: (sql, query) => {
          if (query.bind) {
            console.log(`${sql} [${query.bind}]`);
          } else {
            console.log(sql);
          }
        },
    },

    product: {
        username: 'dbmasteruser',
        password: ':9p}jU,,Qs6PGaeur)nuVX#h}+Y{7!Al',
        database: 'dbmaster',
        host: 'ls-bf6a633560df15b5ac396f6c91f990459393b811.ch2egicsosuj.ap-northeast-2.rds.amazonaws.com',
        port: 3306,
        dialect: "mysql",
        timezone: "+09:00",
        logging: false,
        // NOTE : 쿼리 보고싶을때만 사용
        // logging: (sql, query) => {
        //   if (query.bind) {
        //     console.log(`${sql} [${query.bind}]`);
        //   } else {
        //     console.log(sql);
        //   }
        // },
    },
};
