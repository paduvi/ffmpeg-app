package com.chotoxautinh.conf;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

public class AppConfig {
    public final String APP_NAME;
    public final String APP_VERSION;
    public final String APP_VENDOR;

    private AppConfig(String APP_NAME, String APP_VERSION, String APP_VENDOR) {
        this.APP_NAME = APP_NAME;
        this.APP_VERSION = APP_VERSION;
        this.APP_VENDOR = APP_VENDOR;
    }

    private static class Holder {
        private static final AppConfig INSTANCE;

        static {
            try (InputStream input = Holder.class.getResourceAsStream("/application.properties")) {
                Properties properties = new Properties();
                properties.load(input);
                String appName = properties.getProperty("app.name", "DefaultAppName");
                String appVersion = properties.getProperty("app.version", "0.0.0");
                String appVendor = properties.getProperty("app.vendor", "DefaultVendorName");

                INSTANCE = new AppConfig(appName, appVersion, appVendor);
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }
    }

    public static AppConfig getInstance() {
        return Holder.INSTANCE;
    }
}
