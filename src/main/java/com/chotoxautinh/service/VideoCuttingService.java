package com.chotoxautinh.service;

import java.io.IOException;

public interface VideoCuttingService {
    void cutVideo(String inputPath, String outputPath, double startTime) throws IOException, InterruptedException;
}
