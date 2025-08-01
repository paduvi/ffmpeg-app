package com.chotoxautinh.model;

import com.chotoxautinh.util.ImageUtils;

import javax.annotation.Nonnull;
import java.awt.image.BufferedImage;
import java.util.Iterator;
import java.util.List;

public class FrameDataset implements Iterable<float[]> {
    private final List<BufferedImage> frames;
    private final int width;
    private final int height;

    public FrameDataset(List<BufferedImage> frames, int width, int height) {
        this.frames = frames;
        this.width = width;
        this.height = height;
    }

    @Nonnull
    @Override
    public Iterator<float[]> iterator() {
        return frames.stream()
                .parallel()
                .map(raw -> {
                    // Resize to 224x224 if not resized
                    BufferedImage resized = ImageUtils.resizeBufferedImage(raw, width, height);

                    // Standardize (scale, normalize, CHW)
                    return ImageUtils.preprocess(resized);
                })
                .iterator();
    }

}
