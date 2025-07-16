package com.chotoxautinh.controller;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.model.AudioCodec;
import com.chotoxautinh.model.Constants;
import com.chotoxautinh.model.Preset;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.layout.AnchorPane;
import javafx.stage.DirectoryChooser;
import javafx.stage.FileChooser;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.prefs.Preferences;

public class SettingController extends AbstractController {

    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);

    @FXML
    private CheckBox useDefCkBox;

    @FXML
    private AnchorPane ffmpegLocationPane;

    @FXML
    private TextField ffmpegLocationField;

    @FXML
    private Button ffmpegLocationBtn;

    @FXML
    private ComboBox<String> audioCodecComboBox;

    @FXML
    private ComboBox<String> presetComboBox;

    @FXML
    private TextField outputDestinationField;

    @FXML
    private Button outputDestinationBtn;

    @FXML
    private Slider crfSlider;

    @FXML
    private void initialize() {
        audioCodecComboBox.getItems().addAll(Arrays.stream(AudioCodec.values()).map(AudioCodec::getLabel).toList());
        audioCodecComboBox.setValue(prefs.get(Constants.AUDIO_CODEC_KEY, Constants.DEFAULT_AUDIO_CODEC_VALUE.getLabel()));

        presetComboBox.getItems().addAll(Arrays.stream(Preset.values()).map(Preset::getLabel).toList());
        presetComboBox.setValue(prefs.get(Constants.PRESET_KEY, Constants.DEFAULT_PRESET_VALUE.getLabel()));

        useDefCkBox.setSelected(prefs.getBoolean(Constants.USE_DEFAULT_FFMPEG_KEY, true));
        crfSlider.setValue(prefs.getInt(Constants.CRF_KEY, Constants.DEFAULT_CRF_VALUE));

        ffmpegLocationPane.setVisible(!useDefCkBox.isSelected());
        ffmpegLocationBtn.setDisable(useDefCkBox.isSelected());
        ffmpegLocationField.setText(prefs.get(Constants.FFMPEG_LOCATION_KEY, ""));

        outputDestinationField.setText(prefs.get(Constants.CONTAINER_KEY, Constants.DEFAULT_CONTAINER_VALUE));
    }

    @FXML
    private void handleOpen(ActionEvent event) {
        if (event.getSource() == ffmpegLocationBtn) {
            FileChooser fileChooser = new FileChooser();
            if (!ffmpegLocationField.getText().isEmpty()) {
                File initialDir = new File(ffmpegLocationField.getText());
                if (initialDir.exists()) {
                    fileChooser.setInitialDirectory(initialDir.getParentFile());
                }
            }

            File file = fileChooser.showOpenDialog(getStage());
            ProcessBuilder builder = new ProcessBuilder(file.getAbsolutePath(), "-version");
            builder.redirectErrorStream(true);

            try {
                Process process = builder.start();
                BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                String firstLine = reader.readLine(); // đọc dòng đầu tiên
                process.destroy();

                // Check if first line start with "ffmpeg version"
                if (firstLine != null && firstLine.toLowerCase().startsWith("ffmpeg version")) {
                    ffmpegLocationField.setText(file.getAbsolutePath());
                } else {
                    throw new Exception(firstLine);
                }
            } catch (Exception e) {
                Alert alert = new Alert(Alert.AlertType.WARNING);
                alert.setTitle("Warning");
                alert.setHeaderText("❌ Invalid or wrong executable.");
                alert.setContentText(e.getMessage());

                alert.showAndWait();
            }
        } else if (event.getSource() == outputDestinationBtn) {
            DirectoryChooser directoryChooser = new DirectoryChooser();
            directoryChooser.setTitle("Choose output destination directory");
            File initialDir = new File(outputDestinationField.getText());
            if (initialDir.exists()) {
                directoryChooser.setInitialDirectory(initialDir);
            }

            File selectedDirectory = directoryChooser.showDialog(getStage());
            outputDestinationField.setText(selectedDirectory.getAbsolutePath());
        }
    }

    @FXML
    private void handleToggle() {
        ffmpegLocationPane.setVisible(!useDefCkBox.isSelected());
        ffmpegLocationBtn.setDisable(useDefCkBox.isSelected());
    }

    @FXML
    private void handleReset() {
        useDefCkBox.setSelected(true);
        ffmpegLocationField.clear();
        audioCodecComboBox.setValue(Constants.DEFAULT_AUDIO_CODEC_VALUE.getLabel());
        presetComboBox.setValue(Constants.DEFAULT_PRESET_VALUE.getLabel());
        crfSlider.setValue(Constants.DEFAULT_CRF_VALUE);
        outputDestinationField.setText(Constants.DEFAULT_CONTAINER_VALUE);
    }

    @FXML
    private void handleSave() {
        if (!useDefCkBox.isSelected()) {
            if (ffmpegLocationField.getText().isEmpty()) {
                Alert alert = new Alert(Alert.AlertType.WARNING);
                alert.setTitle("Warning");
                alert.setHeaderText(null);
                alert.setContentText("FFMPEG location cannot be empty");

                alert.showAndWait();
                return;
            }
            prefs.put(Constants.FFMPEG_LOCATION_KEY, ffmpegLocationField.getText());
        }
        prefs.putBoolean(Constants.USE_DEFAULT_FFMPEG_KEY, useDefCkBox.isSelected());
        prefs.put(Constants.AUDIO_CODEC_KEY, audioCodecComboBox.getValue());
        prefs.put(Constants.PRESET_KEY, presetComboBox.getValue());
        prefs.putInt(Constants.CRF_KEY, (int) crfSlider.getValue());
        prefs.put(Constants.CONTAINER_KEY, outputDestinationField.getText());

        getStage().close();
    }

    @FXML
    private void handleCancel() {
        getStage().close();
    }
}
