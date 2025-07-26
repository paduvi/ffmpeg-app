package com.chotoxautinh.dao;

import com.chotoxautinh.model.SampleImage;

import java.sql.SQLException;
import java.util.List;

public interface SampleImageDAO {
    boolean initialize() throws SQLException;

    SampleImage save(SampleImage sampleImage) throws SQLException;

    List<SampleImage> listAll() throws SQLException;

    void delete(SampleImage sampleImage) throws SQLException;
}
