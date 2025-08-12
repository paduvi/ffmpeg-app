package com.chotoxautinh.service.impl;

import com.chotoxautinh.service.VideoCuttingService;
import com.chotoxautinh.util.VideoUtils;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;

@Slf4j
public class VideoCuttingServiceImpl implements VideoCuttingService {
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
        ProcessBuilder builder = new ProcessBuilder(VideoUtils.getBinaryPath(),
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
}