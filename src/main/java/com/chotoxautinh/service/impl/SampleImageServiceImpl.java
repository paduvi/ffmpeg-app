package com.chotoxautinh.service.impl;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.conf.Constants;
import com.chotoxautinh.dao.impl.SampleImageDAOImpl;
import com.chotoxautinh.model.SampleImage;
import com.chotoxautinh.service.SampleImageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.prefs.Preferences;

public class SampleImageServiceImpl implements SampleImageService {
    private static final Logger LOGGER = LoggerFactory.getLogger(SampleImageServiceImpl.class);
    private final SampleImageDAOImpl sampleImageDAO = SampleImageDAOImpl.getInstance();
    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);

    // Private constructor to prevent direct instantiation
    private SampleImageServiceImpl() {
    }

    private static final class SampleImageServiceHolder {
        private static final SampleImageServiceImpl INSTANCE = new SampleImageServiceImpl();
    }

    public static SampleImageServiceImpl getInstance() {
        return SampleImageServiceImpl.SampleImageServiceHolder.INSTANCE;
    }

    @Override
    public void initialize() throws SQLException {
        boolean firstCreation = sampleImageDAO.initialize();
        if (firstCreation) {
            LOGGER.info("Database created successfully");
            SampleImage sampleImage = sampleImageDAO.save(new SampleImage("sample.png", true, ""));
            prefs.put(Constants.SAMPLE_IMAGE_KEY, String.valueOf(sampleImage.getId()));

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

    @Override
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

    @Override
    public List<SampleImage> listAll() throws SQLException, IOException {
        List<SampleImage> images = new ArrayList<>();

        for (SampleImage sampleImage : sampleImageDAO.listAll()) {
            if (!sampleImage.isPermanent()) {
                images.add(sampleImage);
                continue;
            }

            // 1. Read image from resources
            InputStream in = getClass().getResourceAsStream("/img/" + sampleImage.getName());
            if (in == null) {
                throw new IllegalStateException(sampleImage.getName() + " does not exist in resources!");
            }

            // 2. Create a temp file
            Path tempScript = Files.createTempFile(null, sampleImage.getName());
            Files.copy(in, tempScript, StandardCopyOption.REPLACE_EXISTING);

            // 3. (optional) delete temp file after JVM quit
            tempScript.toFile().deleteOnExit();

            images.add(new SampleImage(sampleImage.getId(), sampleImage.getName(), true, tempScript.toAbsolutePath().toString()));
        }

        return images;
    }

    @Override
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
