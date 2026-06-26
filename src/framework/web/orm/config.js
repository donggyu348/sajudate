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
        password: 'eRUH=<g|zZZLsA162oe9{0_rbaTZ7e.P', // DBeaver에 쓴 비밀번호와 동일하게 맞출 것
        database: 'dbmaster',
        host: 'ls-c216d357fd4ef2cd2ac6cd20397f4d40a967e30c.cj4es2g2mopz.ap-northeast-2.rds.amazonaws.com',
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
