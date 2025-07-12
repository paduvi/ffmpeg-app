package com.chotoxautinh.service;

import com.chotoxautinh.dao.SampleImageDAO;
import com.chotoxautinh.model.Constants;
import com.chotoxautinh.model.SampleImage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

public class SampleImageService {
    private static final Logger LOGGER = LoggerFactory.getLogger(SampleImageService.class);
    private final SampleImageDAO sampleImageDAO = SampleImageDAO.getInstance();

    // Private constructor to prevent direct instantiation
    private SampleImageService() {
    }

    private static final class SampleImageServiceHolder {
        private static final SampleImageService INSTANCE = new SampleImageService();
    }

    public static SampleImageService getInstance() {
        return SampleImageService.SampleImageServiceHolder.INSTANCE;
    }

    public void initialize() throws SQLException {
        boolean firstCreation = sampleImageDAO.setupDatabase();
        if (firstCreation) {
            LOGGER.info("Database created successfully");
            sampleImageDAO.save(new SampleImage("sample.png", true, ""));

            // Print all current records
            List<SampleImage> images = sampleImageDAO.listAll();
            LOGGER.info("Current SampleImage records in table:");
            for (SampleImage image : images) {
                LOGGER.info("ID: {}, Name: {}, Path: {}, isPermanent: {}", image.getId(), image.getName(), image.getPath(), image.isPermanent());
            }
        } else {
            LOGGER.info("Database already exists, skipping creation");
        }
    }

    public SampleImage saveImage(File imageFile) throws SQLException, IOException {
        final String directoryPath = "images";
        final Path destinationDir = Path.of(Constants.DATA_PATH, directoryPath);

        // Ensure the directory exists
        if (!Files.exists(destinationDir)) {
            Files.createDirectories(destinationDir);
        }

        // Copy image to directory
        String fileExtension = imageFile.getName().substring(imageFile.getName().lastIndexOf('.'));
        String uniqueFileName = UUID.randomUUID() + fileExtension;
        Path destinationPath = destinationDir.resolve(uniqueFileName);
        Files.copy(imageFile.toPath(), destinationPath, StandardCopyOption.REPLACE_EXISTING);
        LOGGER.info("Image saved to: {}", destinationPath);

        return sampleImageDAO.save(new SampleImage(imageFile.getName(), false, destinationPath.toString()));
    }

    public List<SampleImage> listAll() throws SQLException {
        return sampleImageDAO.listAll();
    }

    public void deleteImageIfNotPermanent(SampleImage sampleImage) throws SQLException, IOException {
        if (sampleImage.isPermanent()) {
            LOGGER.warn("Image is permanent, cannot be deleted: {}", sampleImage.getName());
            return;
        }
        Path imagePath = Paths.get(sampleImage.getPath());
        if (Files.exists(imagePath)) {
            Files.delete(imagePath);
            LOGGER.info("Image deleted: {}", sampleImage.getName());
        }
        sampleImageDAO.delete(sampleImage);
    }
}
