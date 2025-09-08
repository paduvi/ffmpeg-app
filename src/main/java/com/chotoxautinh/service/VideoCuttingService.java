package com.chotoxautinh.service;

import java.io.IOException;
import java.util.function.Consumer;
import java.util.function.Supplier;

public interface VideoCuttingService {
    Double pickBestMoment(String inputVideoPath, String sampleImagePath, Supplier<Boolean> isCancelled, Consumer<Double> consumer) throws Exception;

    void cutVideo(String inputPath, String outputPath, double startTime) throws IOException, InterruptedException;
}
