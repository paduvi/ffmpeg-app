package com.chotoxautinh.service;

import java.io.IOException;
import java.util.function.Consumer;
import java.util.function.Supplier;

public interface VideoCompressionService {
    void compressVideo(String inputPath, String outputPath, Supplier<Boolean> isCancelled, Consumer<Double> consumer) throws IOException, InterruptedException;
}
