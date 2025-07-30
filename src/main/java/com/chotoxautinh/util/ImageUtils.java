package com.chotoxautinh.util;

import org.opencv.core.Mat;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;

public class ImageUtils {

    // Mean and std ImageNet benchmark for ResNet
    private static final float[] MEAN = {0.485f, 0.456f, 0.406f};
    private static final float[] STD = {0.229f, 0.224f, 0.225f};

    /**
     * Convert RGB image to ResNet normalized float[] (CHW format).
     *
     * @param image BufferedImage resized to about 224x224
     * @return float[] of size 3×224×224 (first channel)
     */
    public static float[] preprocess(BufferedImage image) {
        int width = image.getWidth();
        int height = image.getHeight();
        int channels = 3;

        float[] result = new float[channels * width * height];

        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = image.getRGB(x, y);

                // Get the value of each channel (in RGB order)
                int r = (rgb >> 16) & 0xFF;
                int g = (rgb >> 8) & 0xFF;
                int b = rgb & 0xFF;

                // Standardize each channel
                float rf = ((r / 255.0f) - MEAN[0]) / STD[0];
                float gf = ((g / 255.0f) - MEAN[1]) / STD[1];
                float bf = ((b / 255.0f) - MEAN[2]) / STD[2];

                int idx = y * width + x;
                result[idx] = rf; // R
                result[width * height + idx] = gf; // G
                result[2 * width * height + idx] = bf; // B
            }
        }
        return result;
    }

    public static BufferedImage resizeBufferedImage(BufferedImage originalImage, int width, int height) {
        Image tmp = originalImage.getScaledInstance(width, height, Image.SCALE_SMOOTH);
        BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_3BYTE_BGR);
        Graphics2D g2d = resized.createGraphics();
        g2d.drawImage(tmp, 0, 0, null);
        g2d.dispose();
        return resized;
    }

    public static BufferedImage matToBufferedImage(Mat mat) {
        int width = mat.cols();
        int height = mat.rows();
        int channels = mat.channels();

        if (channels != 3) {
            throw new IllegalArgumentException("Only 3-channel BGR Mats are supported");
        }

        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_3BYTE_BGR);
        byte[] data = ((DataBufferByte) image.getRaster().getDataBuffer()).getData();
        mat.get(0, 0, data);
        return image;
    }

}
