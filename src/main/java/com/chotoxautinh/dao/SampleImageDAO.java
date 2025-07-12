package com.chotoxautinh.dao;

import com.chotoxautinh.model.SampleImage;
import com.chotoxautinh.util.DBConnectionUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class SampleImageDAO {
    private static final Logger LOGGER = LoggerFactory.getLogger(SampleImageDAO.class);
    private static final String TABLE_NAME = "sample_images"; // Centralized table name constant
    private final DataSource dataSource;

    // Private constructor to prevent direct instantiation
    private SampleImageDAO() {
        this.dataSource = DBConnectionUtil.getDataSource();
    }

    private static final class SampleImageDAOHolder {
        private static final SampleImageDAO INSTANCE = new SampleImageDAO();
    }

    public static SampleImageDAO getInstance() {
        return SampleImageDAOHolder.INSTANCE;
    }

    public boolean setupDatabase() throws SQLException {
        try (Connection connection = dataSource.getConnection()) {
            DatabaseMetaData meta = connection.getMetaData();

            // Check if the table exists
            try (ResultSet resultSet = meta.getTables(connection.getCatalog(), null, TABLE_NAME.toUpperCase(), new String[]{"TABLE"})) {
                if (resultSet.next()) {
                    LOGGER.info("Table '" + TABLE_NAME + "' already exists, skipping creation.");
                    return false;
                }
            }

            // Create the table if it doesn’t exist
            String createTableSQL = String.format("""
                    CREATE TABLE %s (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        is_permanent BOOLEAN NOT NULL,
                        path VARCHAR(500) NOT NULL
                    );
                    """, TABLE_NAME);
            try (PreparedStatement statement = connection.prepareStatement(createTableSQL)) {
                statement.execute();
                LOGGER.info("Table '" + TABLE_NAME + "' created successfully");
                return true;
            }
        }
    }

    public SampleImage save(SampleImage sampleImage) throws SQLException {
        String insertSQL = String.format("INSERT INTO %s (name, is_permanent, path) VALUES (?, ?, ?)", TABLE_NAME);
        try (Connection connection = dataSource.getConnection();
             PreparedStatement pstmt = connection.prepareStatement(insertSQL, Statement.RETURN_GENERATED_KEYS)) {

            pstmt.setString(1, sampleImage.getName());
            pstmt.setBoolean(2, sampleImage.isPermanent());
            pstmt.setString(3, sampleImage.getPath());
            pstmt.executeUpdate();
            LOGGER.info("Image data saved to database for: {}", sampleImage.getName());

            // Retrieve the generated ID
            try (ResultSet generatedKeys = pstmt.getGeneratedKeys()) {
                if (generatedKeys.next()) {
                    int id = generatedKeys.getInt(1);
                    LOGGER.info("Generated ID: {}", id);
                    return sampleImage.setId(id);
                }
            }
        }
        throw new SQLException("Failed to save image metadata and retrieve generated ID.");
    }

    public List<SampleImage> listAll() throws SQLException {
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

    public void delete(SampleImage sampleImage) throws SQLException {
        // Remove associated data from the database
        String deleteSQL = String.format("DELETE FROM %s WHERE id = ?", TABLE_NAME);
        try (Connection connection = dataSource.getConnection();
             PreparedStatement preparedStatement = connection.prepareStatement(deleteSQL)) {
            preparedStatement.setInt(1, sampleImage.getId());
            int rowsDeleted = preparedStatement.executeUpdate();
            if (rowsDeleted > 0) {
                LOGGER.info("Image data deleted from database for: {}", sampleImage.getName());
            } else {
                LOGGER.warn("No record found in database for image: {}", sampleImage.getName());
            }
        }
    }
}