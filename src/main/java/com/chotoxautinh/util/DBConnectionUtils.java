package com.chotoxautinh.util;

import com.chotoxautinh.conf.Constants;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.h2.Driver;

import javax.sql.DataSource;

public class DBConnectionUtils {
    private static final HikariDataSource dataSource;

    static {
        // Configure HikariCP
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

    public static void shutdown() {
        dataSource.close();
    }
}