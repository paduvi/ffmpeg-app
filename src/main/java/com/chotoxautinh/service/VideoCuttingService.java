package com.chotoxautinh.service;

import org.eclipse.jgit.api.errors.GitAPIException;

import java.io.IOException;
import java.net.URISyntaxException;

public interface VideoCuttingService {
    void initialize() throws GitAPIException, IOException, InterruptedException, URISyntaxException;

    void shutdown();

    float queryChosenTime(String videoPath, String queryImage) throws IOException;

    void cutVideo(String inputPath, String outputPath, float startTime) throws IOException;
}
