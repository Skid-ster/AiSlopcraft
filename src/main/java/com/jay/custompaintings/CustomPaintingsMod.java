package com.jay.custompaintings;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.resource.ResourceManagerHelper;
import net.fabricmc.fabric.api.resource.SimpleSynchronousResourceReloadListener;
import net.fabricmc.fabric.api.client.rendering.v1.TextureRenderContext;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.client.texture.TextureManager;
import net.minecraft.resource.ResourceManager;
import net.minecraft.resource.ResourceReloadListener;
import net.minecraft.util.Identifier;
import net.minecraft.util.profiler.Profiler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class CustomPaintingsMod implements ModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger("CustomPaintings");
    public static final String MOD_ID = "custompaintings";
    
    // List of loaded painting identifiers
    public static final List<Identifier> LOADED_PAINTINGS = new ArrayList<>();

    @Override
    public void onInitialize() {
        LOGGER.info("Initializing Custom Paintings Mod (Java 25)");
        
        // Register Resource Reload Listener for dynamic textures
        ResourceManagerHelper.get(net.minecraft.resource.ResourceType.CLIENT_RESOURCES)
                .registerReloadListener(new CustomPaintingReloadListener());
    }

    static class CustomPaintingReloadListener implements SimpleSynchronousResourceReloadListener {
        @Override
        public void reload(ResourceManager resourceManager, Profiler preparerProfiler, Profiler reloadProfiler) {
            LOADED_PAINTINGS.clear();
            
            // Path: .minecraft/config/custompaintings/images/
            // In dev environment, this might be relative to game directory
            Path configDir = Path.of("config", "custompaintings", "images");
            File dir = configDir.toFile();
            
            if (!dir.exists()) {
                dir.mkdirs();
                LOGGER.info("Created directory: {}", dir.getAbsolutePath());
                return;
            }

            File[] files = dir.listFiles((d, name) -> name.endsWith(".png") || name.endsWith(".jpg"));
            if (files == null || files.length == 0) {
                LOGGER.info("No images found in {}", dir.getAbsolutePath());
                return;
            }

            TextureManager textureManager = net.minecraft.client.MinecraftClient.getInstance().getTextureManager();

            for (File file : files) {
                try {
                    BufferedImage originalImage = ImageIO.read(file);
                    if (originalImage == null) continue;

                    // Resize to 64x64 (standard 1x1 painting size)
                    BufferedImage resizedImage = resizeImage(originalImage, 64, 64);
                    
                    // Convert to NativeImageBackedTexture
                    NativeImageBackedTexture texture = new NativeImageBackedTexture(resizedImage);
                    
                    // Create Identifier
                    String fileName = file.getName().replaceAll("\\.[^.]+$", "");
                    Identifier id = new Identifier(MOD_ID, "painting/" + fileName);
                    
                    // Register texture
                    textureManager.registerTexture(id, texture);
                    LOADED_PAINTINGS.add(id);
                    
                    LOGGER.info("Loaded painting texture: {}", id);
                } catch (IOException e) {
                    LOGGER.error("Failed to load image {}", file.getName(), e);
                }
            }
        }

        private BufferedImage resizeImage(BufferedImage original, int targetWidth, int targetHeight) {
            BufferedImage resized = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = resized.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(original, 0, 0, targetWidth, targetHeight, null);
            g.dispose();
            return resized;
        }
    }
}
