package com.chotoxautinh.service;

import com.chotoxautinh.model.SampleImage;

import java.io.File;
import java.io.IOException;
import java.sql.SQLException;
import java.util.List;

public interface SampleImageService {

    void initialize() throws SQLException;

    SampleImage saveImage(File imageFile) throws SQLException, IOException;

    List<SampleImage> listAll() throws SQLException, IOException;

    void deleteImageIfNotPermanent(SampleImage sampleImage) throws SQLException, IOException;
}
