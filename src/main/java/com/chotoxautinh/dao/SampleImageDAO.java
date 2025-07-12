package com.chotoxautinh.dao;

import com.chotoxautinh.model.Constants;
import com.chotoxautinh.model.SampleImage;
import com.chotoxautinh.util.DBConnectionUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public class SampleImageDAO {
    private static final Logger LOGGER = LoggerFactory.getLogger(SampleImageDAO.class);
    private static final String TABLE_NAME = "sample_images"; // Centralized table name constant
    private final DataSource dataSource;

    // Private constructor to prevent direct instantiation
    private SampleImageDAO() throws SQLException {
        this.dataSource = DBConnectionUtil.getDataSource();
        this.setupDatabase();
    }

    private static final class SampleImageDAOHolder {
        private static final SampleImageDAO INSTANCE;

        static {
            try {
                INSTANCE = new SampleImageDAO();
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        }
    }

    public static SampleImageDAO getInstance() {
        return SampleImageDAOHolder.INSTANCE;
    }

    private void setupDatabase() throws SQLException {
        try (Connection connection = dataSource.getConnection()) {
            DatabaseMetaData meta = connection.getMetaData();

            // Check if the table exists
            try (ResultSet resultSet = meta.getTables(connection.getCatalog(), null, TABLE_NAME.toUpperCase(), new String[]{"TABLE"})) {
                if (resultSet.next()) {
                    LOGGER.info("Table '" + TABLE_NAME + "' already exists, skipping creation.");
                    return;
                }
            }

            // Create the table if it doesn’t exist
            String createTableSQL = String.format("""
                    CREATE TABLE %s (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        is_permanent BOOLEAN NOT NULL,
                        path VARCHAR(500) NULL
                    );
                    """, TABLE_NAME);
            try (PreparedStatement statement = connection.prepareStatement(createTableSQL)) {
                statement.execute();
                LOGGER.info("Table '" + TABLE_NAME + "' created successfully");
            }

            // Insert the initial record into the table
            String insertSQL = String.format("INSERT INTO %s (name, is_permanent) VALUES (?, ?)", TABLE_NAME);
            try (PreparedStatement insertStmt = connection.prepareStatement(insertSQL)) {
                insertStmt.setString(1, "sample.png");
                insertStmt.setBoolean(2, true);
                insertStmt.executeUpdate();
                LOGGER.info("Initial record inserted into '" + TABLE_NAME + "' table");
            }

            // Print all current records
            List<SampleImage> images = loadAllImages();
            LOGGER.info("Current records in '" + TABLE_NAME + "' table:");
            for (SampleImage image : images) {
                LOGGER.info(String.format("ID: %d, Name: %s, Path: %s, isPermanent: %b",
                        image.id(), image.name(), image.path(), image.permanent()));
            }
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
        LOGGER.info("Image saved to: " + destinationPath);

        // Save the image metadata in the database
        String insertSQL = String.format("INSERT INTO %s (name, is_permanent, path) VALUES (?, ?, ?)", TABLE_NAME);
        try (Connection connection = dataSource.getConnection();
             PreparedStatement pstmt = connection.prepareStatement(insertSQL)) {

            pstmt.setString(1, imageFile.getName());
            pstmt.setBoolean(2, false);
            pstmt.setString(3, destinationPath.toString());
            pstmt.executeUpdate();
            LOGGER.info("Image data saved to database for: " + imageFile.getName());

            // Retrieve the generated ID
            try (ResultSet generatedKeys = pstmt.getGeneratedKeys()) {
                if (generatedKeys.next()) {
                    int id = generatedKeys.getInt(1);
                    return new SampleImage(id, imageFile.getName(), false, destinationPath.toString());
                }
            }
        }
        throw new SQLException("Failed to save image metadata and retrieve generated ID.");
    }

    public List<SampleImage> loadAllImages() throws SQLException {
        String selectSQL = String.format("SELECT * FROM %s", TABLE_NAME);
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(selectSQL);
             ResultSet rs = statement.executeQuery()) {

            List<SampleImage> images = new ArrayList<>();
            while (rs.next()) {
                int id = rs.getInt("id");
                String name = rs.getString("name");
                boolean isPermanent = rs.getBoolean("is_permanent");
                String path = rs.getString("path");
                if (isPermanent) {
                    path = Objects.requireNonNull(getClass().getResource("/img/" + name)).getPath();
                }
                images.add(new SampleImage(id, name, isPermanent, path));
            }
            return images;
        }
    }

    public void deleteImageIfNotPermanent(SampleImage sampleImage) throws IOException, SQLException {
        if (sampleImage.permanent()) {
            LOGGER.warn("Image is permanent, cannot be deleted: {}", sampleImage.name());
            return;
        }
        Path imagePath = Paths.get(sampleImage.path());
        if (Files.exists(imagePath)) {
            Files.delete(imagePath);
            LOGGER.info("Image deleted: {}", sampleImage.name());
        }

        // Remove associated data from the database
        String deleteSQL = String.format("DELETE FROM %s WHERE id = ?", TABLE_NAME);
        try (Connection connection = dataSource.getConnection();
             PreparedStatement preparedStatement = connection.prepareStatement(deleteSQL)) {
            preparedStatement.setInt(1, sampleImage.id());
            int rowsDeleted = preparedStatement.executeUpdate();
            if (rowsDeleted > 0) {
                LOGGER.info("Image data deleted from database for: {}", sampleImage.name());
            } else {
                LOGGER.warn("No record found in database for image: {}", sampleImage.name());
            }
        }
    }
}