package com.chotoxautinh.conf;

import com.chotoxautinh.model.AudioCodec;
import com.chotoxautinh.model.Preset;

import java.io.File;

public class Constants {
    public static final String AUDIO_CODEC_KEY = "AUDIO_CODEC";
    public static final AudioCodec DEFAULT_AUDIO_CODEC_VALUE = AudioCodec.COPY;

    public static final String VIDEO_EXTENSION_KEY = "VIDEO_EXTENSION";
    public static final String DEFAULT_VIDEO_EXTENSION_VALUE = "COPY";

    public static final String PRESET_KEY = "PRESET";
    public static final Preset DEFAULT_PRESET_VALUE = Preset.MEDIUM;

    public static final String USE_DEFAULT_FFMPEG_KEY = "USE_DEFAULT_FFMPEG";
    public static final String FFMPEG_LOCATION_KEY = "FFMPEG_LOCATION";

    public static final String CRF_KEY = "CRF";
    public static final int DEFAULT_CRF_VALUE = 23;

    public static final String CONTAINER_KEY = "CONTAINER";
    public static final String DEFAULT_CONTAINER_VALUE = System.getProperty("user.home") + File.separator + "ffmpeg-output";

    public static final String DATA_PATH = System.getProperty("user.home") + File.separator + ".dogy-ffmpeg-app";
    public static final String DATABASE_URL = "jdbc:h2:" + DATA_PATH + File.separator + "db";
    public static final String DATABASE_USER = "sa";
    public static final String DATABASE_PASSWORD = "";
    public static final int DATABASE_CONNECTION_POOL_SIZE = 10;

    public static final String SAMPLE_IMAGE_KEY = "SAMPLE_IMAGE";
}
