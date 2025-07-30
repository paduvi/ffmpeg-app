package com.chotoxautinh.util;

import org.nd4j.linalg.api.ndarray.INDArray;
import org.nd4j.linalg.factory.Nd4j;

import java.util.ArrayList;
import java.util.List;

public class SimilarityUtils {

    /**
     * Find the frame index and timestamp when similarity score drops after a high period.
     *
     * @param similarities    NDArray shape [N], cosine similarity scores
     * @param timestamps      frame timestamps in milliseconds
     * @param threshold       min value to consider "high" similarity (default 0.9)
     * @param minHighDuration minimum high period duration (in seconds) to be valid (default 2.0)
     * @return frameIndex or null if not found
     */
    public static Integer findSampleEndMoment(
            INDArray similarities, long[] timestamps,
            double threshold, double minHighDuration) {
        // Create a mask similar >= threshold
        INDArray highMask = similarities.gt(threshold);

        // Convert to float[] for easy manipulation
        float[] maskArr = highMask.data().asFloat();

        // Calculate transitions
        List<Integer> highStarts = new ArrayList<>();
        List<Integer> highEnds = new ArrayList<>();

        for (int i = 1; i < maskArr.length; i++) {
            int prev = (int) maskArr[i - 1];
            int curr = (int) maskArr[i];

            if (prev == 0 && curr == 1) {
                highStarts.add(i);
            } else if (prev == 1 && curr == 0) {
                highEnds.add(i);
            }
        }

        // Handling edge cases
        if (highStarts.isEmpty() && highEnds.isEmpty()) {
            return null;
        }

        if (!highEnds.isEmpty() && (highStarts.isEmpty() || highEnds.getFirst() < highStarts.getFirst())) {
            highStarts.addFirst(0);
        }

        if (highEnds.isEmpty() || highStarts.getLast() > highEnds.getLast()) {
            highEnds.add(similarities.length());
        }

        // Check the highs are long enough
        for (int i = 0; i < Math.min(highStarts.size(), highEnds.size()); i++) {
            int startIdx = highStarts.get(i);
            int endIdx = highEnds.get(i);

            if (startIdx >= timestamps.length || endIdx >= timestamps.length) continue;

            long durationMs = timestamps[endIdx] - timestamps[startIdx];
            double durationSec = durationMs / 1000.0;

            if (durationSec >= minHighDuration) {
                return endIdx;
            }
        }

        return null;
    }

    /**
     * Calculate cosine similarity between the template vector and each vector in the batch (ND4J 0.9.1)
     *
     * @param template float[dim] template image vector
     * @param batch    List<float[dim]> vectors from the video frame
     * @return float[B] cosine similarity
     */
    public static float[] cosineSimilarityBatch(float[] template, float[][] batch) {
        int dim = template.length;

        // 1. Convert batch → INDArray [B, D]
        INDArray batchMatrix = Nd4j.create(batch); // shape: [B, D]

        // 2. Convert template → INDArray [1, D]
        INDArray templateVector = Nd4j.create(template).reshape(1, dim); // shape: [1, D]

        // 3: Normalize both
        INDArray frameNorms = batchMatrix.norm2(1);    // [B, 1]
        INDArray templateNorm = templateVector.norm2(1);   // [1, 1]

        INDArray normalizedFrames = batchMatrix.div(frameNorms.repeat(1, dim));     // [B, D]
        INDArray normalizedTemplate = templateVector.div(templateNorm.repeat(1, dim)); // [1, D]

        // 4: Cosine similarity = dot(normalized)
        return normalizedFrames.mmul(normalizedTemplate.transpose()).data().asFloat(); // [N, 1]
    }
}
