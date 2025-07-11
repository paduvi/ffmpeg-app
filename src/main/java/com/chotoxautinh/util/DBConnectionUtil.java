package com.chotoxautinh.util;

import com.chotoxautinh.model.Constants;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.h2.Driver;

import javax.sql.DataSource;

public class DBConnectionUtil {
    private static final HikariDataSource dataSource;

    static {
        // Configure HikariCP
        System.out.println(Constants.DATABASE_URL);
        HikariConfig config = new HikariConfig();
        config.setDriverClassName(Driver.class.getName());
        config.setJdbcUrl(Constants.DATABASE_URL);
        config.setUsername(Constants.DATABASE_USER);
        config.setPassword(Constants.DATABASE_PASSWORD);
        config.setMaximumPoolSize(Constants.DATABASE_CONNECTION_POOL_SIZE);

        dataSource = new HikariDataSource(config);
    }

    public static DataSource getDataSource() {
        return dataSource;
    }
}