package com.chotoxautinh.controller;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.model.Constants;
import com.chotoxautinh.model.SampleImage;
import com.chotoxautinh.service.SampleImageService;
import com.chotoxautinh.util.AppUtil;
import com.chotoxautinh.util.PythonUtil;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.AnchorPane;
import javafx.stage.FileChooser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.sql.SQLException;
import java.util.LinkedList;
import java.util.List;
import java.util.Objects;
import java.util.prefs.Preferences;

public class VideoCuttingController extends AbstractController {
    private static final Logger LOGGER = LoggerFactory.getLogger(VideoCuttingController.class);
    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);

    @FXML
    private AnchorPane overlay;

    @FXML
    private ImageView previewImg;

    @FXML
    private TableView<SampleImage> tableView;
    @FXML
    private TableColumn<SampleImage, Boolean> selectColumn;
    @FXML
    private TableColumn<SampleImage, String> nameColumn;
    @FXML
    private TableColumn<SampleImage, Void> actionColumn;

    private final SampleImageService sampleImageService = SampleImageService.getInstance();
    private final ObservableList<SampleImage> sampleImageData = FXCollections.observableArrayList();
    private final ToggleGroup toggleGroup = new ToggleGroup();

    @FXML
    private void initialize() throws IOException, URISyntaxException, InterruptedException, SQLException {
        if (!PythonUtil.isPythonAvailable()) {
            showOverlay(true);
        }

        selectColumn.setCellValueFactory(cellData -> cellData.getValue().selectedProperty());
        selectColumn.setCellFactory(column -> new TableCell<>() {
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

        actionColumn.setGraphic(getActionHeaderButton());
        actionColumn.setCellFactory(col -> new TableCell<>() {
            private final Button btn = new Button("Delete");

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
                        LOGGER.error("Error sampleImageService.deleteImageIfNotPermanent: {}", ex.getMessage(), ex);
                        AppUtil.alertError(ex);
                    }
                });

                setGraphic(btn);
            }
        });

        nameColumn.setCellValueFactory(cellData -> cellData.getValue().nameProperty());

        tableView.setRowFactory(tv -> {
            TableRow<SampleImage> row = new TableRow<>();

            row.setOnMouseClicked(event -> {
                if (!row.isEmpty()) {
                    // Identify the selected position
                    TablePosition<?, ?> pos = tableView.getSelectionModel().getSelectedCells().stream()
                            .findFirst().orElse(null);

                    if (pos == null) return;

                    int clickedColumnIndex = pos.getColumn();
                    int lastColumnIndex = tableView.getColumns().size() - 1;

                    // Ignore if it's the last column
                    if (clickedColumnIndex == lastColumnIndex) {
                        return;
                    }
                    selectSampleImage(row.getIndex());
                }
            });

            return row;
        });
        tableView.setItems(sampleImageData);

        String selectedId = prefs.get(Constants.SAMPLE_IMAGE_KEY, null);
        for (SampleImage sampleImage : sampleImageService.listAll()) {
            sampleImageData.add(sampleImage);

            if (Objects.equals(String.valueOf(sampleImage.getId()), selectedId)) {
                sampleImage.setSelected(true);
                sampleImage.setDeleteVisible(false);
                if (sampleImage.isPermanent()) {
                    previewImg.setImage(new Image(Objects.requireNonNull(getClass().getResourceAsStream("/img/" + sampleImage.getName()))));
                } else {
                    previewImg.setImage(new Image("file:" + sampleImage.getPath().replace("\\", "/")));
                }
            }
        }
    }

    private void selectSampleImage(int index) {
        SampleImage selectedItem = tableView.getItems().get(index);
        prefs.put(Constants.SAMPLE_IMAGE_KEY, String.valueOf(selectedItem.getId()));

        for (SampleImage r : tableView.getItems()) {
            boolean isSelected = r.getId().equals(selectedItem.getId());
            r.setSelected(isSelected);
            r.setDeleteVisible(!isSelected);

            if (isSelected) {
                if (r.isPermanent()) {
                    previewImg.setImage(new Image(Objects.requireNonNull(getClass().getResourceAsStream("/img/" + r.getName()))));
                } else {
                    previewImg.setImage(new Image("file:" + r.getPath().replace("\\", "/")));
                }
            }
        }
        tableView.refresh();
    }

    private Button getActionHeaderButton() {
        Button headerButton = new Button("Add Image");
        headerButton.setOnAction(e -> {
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
                        LOGGER.error("Error sampleImageService.saveImage: {}", ex.getMessage(), ex);
                        AppUtil.alertError(ex);
                    }
                }
            }
        });
        return headerButton;
    }

    public void showOverlay(boolean show) {
        overlay.setVisible(show);
    }

}
