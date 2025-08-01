package com.chotoxautinh.controller.cutting;

import ai.onnxruntime.OrtException;
import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.conf.Constants;
import com.chotoxautinh.controller.AbstractController;
import com.chotoxautinh.model.SampleImage;
import com.chotoxautinh.model.Video;
import com.chotoxautinh.service.SampleImageService;
import com.chotoxautinh.service.impl.SampleImageServiceImpl;
import com.chotoxautinh.util.AppUtils;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.control.cell.CheckBoxTableCell;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.VBox;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import java.util.Objects;
import java.util.prefs.Preferences;

@Slf4j
public class VideoCuttingController extends AbstractController {
    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);
    private final SampleImageService sampleImageService = SampleImageServiceImpl.getInstance();

    @FXML
    private ImageView previewImg;

    @FXML
    private TableView<Video> tableView;
    @FXML
    private TableColumn<Video, Boolean> selectColumn;
    @FXML
    private TableColumn<Video, String> nameColumn;
    @FXML
    private TableColumn<Video, String> durationColumn;
    @FXML
    private TableColumn<Video, String> sizeColumn;
    @FXML
    private TableColumn<Video, String> typeColumn;

    @FXML
    private TableView<SampleImage> sampleImageTableView;
    @FXML
    private TableColumn<SampleImage, Boolean> sampleImageSelectColumn;
    @FXML
    private TableColumn<SampleImage, String> sampleImageNameColumn;
    @FXML
    private TableColumn<SampleImage, Void> sampleImageActionColumn;

    private String sampleImagePath;
    private final ObservableList<SampleImage> sampleImageData = FXCollections.observableArrayList();
    private final ObservableList<Video> videoData = FXCollections.observableArrayList();

    @FXML
    private void initialize() throws IOException, URISyntaxException, SQLException {
        final ToggleGroup toggleGroup = new ToggleGroup();

        selectColumn.setCellValueFactory(cellData -> cellData.getValue().selectedProperty());
        selectColumn.setCellFactory(CheckBoxTableCell.forTableColumn(selectColumn));
        nameColumn.setCellValueFactory(cellData -> cellData.getValue().nameProperty());
        sizeColumn.setCellValueFactory(cellData -> cellData.getValue().sizeProperty());
        durationColumn.setCellValueFactory(cellData -> cellData.getValue().durationProperty());
        typeColumn.setCellValueFactory(cellData -> cellData.getValue().typeProperty());

        tableView.setPlaceholder(new Label("Your Video Bin is empty"));
        tableView.setRowFactory(tv -> {
            TableRow<Video> row = new TableRow<>();
            row.setOnMouseClicked(event -> {
                if (!row.isEmpty()) {
                    Video rowData = row.getItem();
                    // Toggle checkbox
                    rowData.selectedProperty().set(!rowData.selectedProperty().get());
                }
            });
            return row;
        });
        tableView.setItems(videoData);

        sampleImageSelectColumn.setCellValueFactory(cellData -> cellData.getValue().selectedProperty());
        sampleImageSelectColumn.setCellFactory(column -> new TableCell<>() {
            private final RadioButton radioButton = new RadioButton();

            {
                radioButton.setToggleGroup(toggleGroup);

                // When click on RadioButton, update the selected property
                radioButton.setOnAction(e -> selectSampleImage(getIndex()));
            }

            @Override
            protected void updateItem(Boolean selected, boolean empty) {
                super.updateItem(selected, empty);
                if (empty || selected == null) {
                    setGraphic(null);
                    return;
                }
                radioButton.setSelected(selected);
                setGraphic(radioButton);
            }
        });

        sampleImageActionColumn.setCellFactory(col -> new TableCell<>() {
            private final Button btn = new Button("Remove");

            @Override
            protected void updateItem(Void item, boolean empty) {
                super.updateItem(item, empty);

                if (empty) {
                    setGraphic(null);
                    return;
                }

                SampleImage row = getTableView().getItems().get(getIndex());
                if (row == null || row.isPermanent()) {
                    setGraphic(null);
                    return;
                }

                btn.visibleProperty().bind(row.deleteVisibleProperty());
                btn.managedProperty().bind(btn.visibleProperty());
                btn.setOnAction(e -> {
                    try {
                        sampleImageService.deleteImageIfNotPermanent(row);
                        sampleImageData.remove(row);
                    } catch (SQLException | IOException ex) {
                        log.error("Error sampleImageService.deleteImageIfNotPermanent: {}", ex.getMessage(), ex);
                        AppUtils.alertError(ex);
                    }
                });

                setGraphic(btn);
            }
        });

        sampleImageNameColumn.setCellValueFactory(cellData -> cellData.getValue().nameProperty());

        sampleImageTableView.setRowFactory(tv -> {
            TableRow<SampleImage> row = new TableRow<>();

            row.setOnMouseClicked(event -> {
                if (!row.isEmpty()) {
                    // Identify the selected position
                    TablePosition<?, ?> pos = sampleImageTableView.getSelectionModel().getSelectedCells().stream()
                            .findFirst().orElse(null);

                    if (pos == null) return;

                    int clickedColumnIndex = pos.getColumn();
                    int lastColumnIndex = sampleImageTableView.getColumns().size() - 1;

                    // Ignore if it's the last column
                    if (clickedColumnIndex == lastColumnIndex) {
                        return;
                    }
                    selectSampleImage(row.getIndex());
                }
            });

            return row;
        });
        sampleImageTableView.setItems(sampleImageData);

        String selectedId = prefs.get(Constants.SAMPLE_IMAGE_KEY, null);
        for (SampleImage sampleImage : sampleImageService.listAll()) {
            sampleImageData.add(sampleImage);

            if (Objects.equals(String.valueOf(sampleImage.getId()), selectedId)) {
                sampleImage.setSelected(true);
                sampleImage.setDeleteVisible(false);
                setSelectedImage(sampleImage);
            }
        }
    }

    private void selectSampleImage(int index) {
        SampleImage selectedItem = sampleImageTableView.getItems().get(index);
        prefs.put(Constants.SAMPLE_IMAGE_KEY, String.valueOf(selectedItem.getId()));

        for (SampleImage r : sampleImageTableView.getItems()) {
            boolean isSelected = r.getId().equals(selectedItem.getId());
            r.setSelected(isSelected);
            r.setDeleteVisible(!isSelected);

            if (isSelected) {
                try {
                    setSelectedImage(r);
                } catch (URISyntaxException e) {
                    log.error("Error setSelectedImage: {}", e.getMessage(), e);
                    AppUtils.alertError(e);
                }
            }
        }
        sampleImageTableView.refresh();
    }

    private void setSelectedImage(SampleImage sampleImage) throws URISyntaxException {
        previewImg.setImage(new Image("file:" + sampleImage.getPath().replace("\\", "/")));
        sampleImagePath = sampleImage.getPath();
    }

    @FXML
    private void handleAddSampleImage(ActionEvent event) {
        Button button = (Button) event.getSource();
        button.setDisable(true);
        FileChooser fileChooser = new FileChooser();

        // Set extension filter
        fileChooser.getExtensionFilters()
                .add(new FileChooser.ExtensionFilter("Joint Photographic Experts Group (.jpg,jpeg)", "*.jpg", "*.jpeg"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Portable Network Graphics (.png)", "*.png"));

        List<String> allExtensions = new LinkedList<>();
        for (FileChooser.ExtensionFilter extensionFilter : fileChooser.getExtensionFilters()) {
            allExtensions.addAll(extensionFilter.getExtensions());
        }
        fileChooser.getExtensionFilters().addFirst(new FileChooser.ExtensionFilter("All", allExtensions));

        for (File file : fileChooser.showOpenMultipleDialog(getStage())) {
            if (file != null) {
                try {
                    SampleImage sampleImage = sampleImageService.saveImage(file);
                    sampleImageData.add(sampleImage);
                } catch (SQLException | IOException ex) {
                    log.error("Error sampleImageService.saveImage: {}", ex.getMessage(), ex);
                    AppUtils.alertError(ex);
                }
            }
        }
        button.setDisable(false);
    }

    @FXML
    private void handleOpen(ActionEvent event) {
        Button button = (Button) event.getSource();
        button.setDisable(true);

        FileChooser fileChooser = new FileChooser();

        // Set extension filter
        fileChooser.getExtensionFilters()
                .add(new FileChooser.ExtensionFilter("MPEG (.mpeg,mp4,mp3)", "*.mpeg", "*.mp4", "*.mp3"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("QuickTime File Format (.mov)", "*.mov"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("AVI (.avi)", "*.avi"));
        fileChooser.getExtensionFilters()
                .add(new FileChooser.ExtensionFilter("Ogg Video (.ogg,ogv)", "*.ogv", "*.ogg"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("GIF (.gif)", "*.gif"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Flash Video (.flv)", "*.flv"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("M4V (.m4v)", "*.m4v"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Windows Media Video (.wmv)", "*.wmv"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("WebM (.webm)", "*.webm"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Matroska (.mkv)", "*.mkv"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Vob (.vob)", "*.vob"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Dirac (.dirac)", "*.dirac"));
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("RealMedia (.rm)", "*.rm"));
        fileChooser.getExtensionFilters()
                .add(new FileChooser.ExtensionFilter("Advanced Systems Format (.asf)", "*.asf"));
        fileChooser.getExtensionFilters()
                .add(new FileChooser.ExtensionFilter("Material Exchange Format (.mxf)", "*.mxf"));
        fileChooser.getExtensionFilters()
                .add(new FileChooser.ExtensionFilter("Nullsoft Streaming Video (.nsv)", "*.nsv"));

        List<String> allExtensions = new LinkedList<>();
        for (FileChooser.ExtensionFilter extensionFilter : fileChooser.getExtensionFilters()) {
            allExtensions.addAll(extensionFilter.getExtensions());
        }
        fileChooser.getExtensionFilters().addFirst(new FileChooser.ExtensionFilter("All", allExtensions));

        // Show open file dialog
        List<File> files = fileChooser.showOpenMultipleDialog(getStage());

        if (files != null && !files.isEmpty()) {
            loadVideoDataFromFiles(files);
        }
        button.setDisable(false);
    }

    @FXML
    private void handleRemove() {
        videoData.removeIf(Video::getSelected);
    }

    @FXML
    private void handleSelectAll() {
        for (Video video : videoData) {
            video.setSelected(true);
        }
    }

    @FXML
    private void handleCut() {
        List<Video> list = new ArrayList<>();
        for (Video video : videoData) {
            if (video.getSelected())
                list.add(video);
        }
        if (list.isEmpty()) {
            Alert alert = new Alert(Alert.AlertType.WARNING);
            alert.setTitle("Warning");
            alert.setHeaderText(null);
            alert.setContentText("You pressed the button without selecting any video. Really!!!??");

            alert.showAndWait();
            return;
        }
        try {
            // Load the fxml file and create a new stage for the popup.
            FXMLLoader loader = new FXMLLoader();
            loader.setLocation(getClass().getResource("/view/ProgressLayout.fxml"));

            CuttingProgressController controller = new CuttingProgressController();
            loader.setController(controller);

            VBox progress = loader.load();
            Stage dialogStage = new Stage();
            dialogStage.setTitle("Processing...");
            dialogStage.initModality(Modality.APPLICATION_MODAL);
            dialogStage.initOwner(getStage());
            Scene scene = new Scene(progress);
            scene.getStylesheets().add(Objects.requireNonNull(getClass().getResource("/style/application.css")).toExternalForm());
            dialogStage.setScene(scene);

            // Set the videos into the controller.
            controller.setStage(dialogStage);
            log.info("Sample Image Path: {}", sampleImagePath);
            controller.setVideos(list, sampleImagePath);

            dialogStage.show();
        } catch (IOException | OrtException e) {
            log.error("Error handleCut: {}", e.getMessage(), e);
            AppUtils.alertError(e);
        }
    }

    private void loadVideoDataFromFiles(List<File> files) {
        // Check duplicated files
        List<String> mapped = videoData.stream().map(Video::getPath).toList();
        for (File file : files) {
            if (!mapped.contains(file.getAbsolutePath()))
                videoData.add(new Video(file));
        }
    }

}
