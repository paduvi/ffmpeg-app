package com.chotoxautinh.util;

import org.nd4j.linalg.api.buffer.DataType;
import org.nd4j.linalg.api.ndarray.INDArray;
import org.nd4j.linalg.factory.Nd4j;
import org.nd4j.linalg.indexing.NDArrayIndex;

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
        // Create mask: 1 if >= threshold, 0 if < threshold
        INDArray mask = similarities.gte(threshold).castTo(DataType.FLOAT);

        // Calculate the difference between successive elements to find the transition
        INDArray before = mask.get(NDArrayIndex.interval(0, mask.length() - 1)); // [:-1]
        INDArray after = mask.get(NDArrayIndex.interval(1, mask.length()));   // [1:] → [N-1]
        INDArray transitions = after.sub(before); // = mask[i] - mask[i-1] = [N-1]

        // Convert transitions to a Java array
        float[] transArr = transitions.toFloatVector();

        List<Integer> highStarts = new ArrayList<>();
        List<Integer> highEnds = new ArrayList<>();

        for (int i = 0; i < transArr.length; i++) {
            if (transArr[i] == 1.0f) highStarts.add(i + 1);     // rising edge
            else if (transArr[i] == -1.0f) highEnds.add(i + 1); // falling edge
        }

        if (highStarts.isEmpty() && highEnds.isEmpty()) return null;
        if (!highEnds.isEmpty() && (highStarts.isEmpty() || highEnds.getFirst() < highStarts.getFirst())) {
            highStarts.addFirst(0);
        }
        if (highEnds.isEmpty() || highStarts.getLast() > highEnds.getLast()) {
            highEnds.add((int) similarities.length());
        }

        for (int i = 0; i < Math.min(highStarts.size(), highEnds.size()); i++) {
            int start = highStarts.get(i);
            int end = highEnds.get(i);
            if (start >= timestamps.length || end >= timestamps.length) continue;

            double durationSec = (timestamps[end] - timestamps[start]) / 1000.0;
            if (durationSec >= minHighDuration) {
                return end;
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
        final int B = batch.length;
        final int D = template.length;

        try (
                // 1. Convert batch → INDArray [B, D]
                INDArray batchMatrix = Nd4j.create(batch); // shape: [B, D]

                // 2. Convert template → INDArray [1, D]
                INDArray templateVector = Nd4j.create(template).reshape(1, D) // shape: [1, D]
        ) {
            // 3: Normalize both
            INDArray frameNorms = batchMatrix.norm2(1).reshape(B, 1);    // [B, 1]
            INDArray templateNorm = templateVector.norm2(1).reshape(1, 1);   // [1, 1]

            INDArray normalizedFrames = batchMatrix.div(frameNorms);     // [B, D]
            INDArray normalizedTemplate = templateVector.div(templateNorm); // [1, D]

            // 4: Cosine similarity = dot(normalized)
            return normalizedFrames.mmul(normalizedTemplate.transpose()).toFloatVector(); // [B, 1]
        }
    }
}
