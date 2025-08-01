package com.chotoxautinh.service.impl;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.conf.Constants;
import com.chotoxautinh.service.VideoCuttingService;
import lombok.extern.slf4j.Slf4j;
import org.bytedeco.javacpp.Loader;

import java.io.IOException;
import java.util.prefs.Preferences;

@Slf4j
public class VideoCuttingServiceImpl implements VideoCuttingService {
    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);

    // Private constructor to prevent direct instantiation
    private VideoCuttingServiceImpl() {
    }

    private static final class VideoCuttingServiceHolder {
        private static final VideoCuttingServiceImpl INSTANCE = new VideoCuttingServiceImpl();
    }

    public static VideoCuttingServiceImpl getInstance() {
        return VideoCuttingServiceImpl.VideoCuttingServiceHolder.INSTANCE;
    }

    @Override
    public void cutVideo(String inputPath, String outputPath, double startTime) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(getBinaryPath(),
                "-i", inputPath,
                "-c", "copy",
                "-threads", "0",
                "-ss", String.valueOf(Math.floor(startTime)),
                "-y", outputPath);
        builder.redirectErrorStream(true);
        builder.inheritIO();
        Process process = builder.start();
        process.waitFor();
    }

    private String getBinaryPath() {
        if (prefs.getBoolean(Constants.USE_DEFAULT_FFMPEG_KEY, true))
            return Loader.load(org.bytedeco.ffmpeg.ffmpeg.class);
        return prefs.get(Constants.FFMPEG_LOCATION_KEY, Loader.load(org.bytedeco.ffmpeg.ffmpeg.class));
    }

}