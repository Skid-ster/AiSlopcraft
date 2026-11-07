package com.jay.custompaintings;

import io.github.prospector.modmenu.api.ModMenuApi;
import io.github.prospector.modmenu.api.ModMenuApiProvider;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.config.ModConfigScreenFactory;
import net.minecraft.text.Text;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class CustomPaintingsModMenu implements ModMenuApi {
    public static final Logger LOGGER = LoggerFactory.getLogger("CustomPaintingsModMenu");

    @Override
    public String getModId() {
        return CustomPaintingsMod.MOD_ID;
    }

    @Override
    public ModConfigScreenFactory getModConfigScreenFactory() {
        return (parent, client) -> new CustomPaintingsConfigScreen(parent, CustomPaintingsMod.LOADED_PAINTINGS);
    }

    // Custom Screen to display loaded images
    static class CustomPaintingsConfigScreen extends Screen {
        private final List<net.minecraft.util.Identifier> loadedPaintings;

        public CustomPaintingsConfigScreen(Screen parent, List<net.minecraft.util.Identifier> loadedPaintings) {
            super(Text.literal("Custom Paintings Loaded"));
            this.parent = parent;
            this.loadedPaintings = loadedPaintings;
        }

        @Override
        protected void init() {
            super.init();
            // In a real implementation, we would add buttons or a list widget here
            // For this implementation, we log the list and show a summary
            LOGGER.info("Config screen initialized with {} paintings", loadedPaintings.size());
        }

        @Override
        public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
            super.render(context, mouseX, mouseY, delta);
            int y = this.height / 4;
            context.drawText(this.textRenderer, "Loaded Paintings:", this.width / 2 - 50, y, 0xFFFFFF, false);
            y += 20;
            for (net.minecraft.util.Identifier id : loadedPaintings) {
                context.drawText(this.textRenderer, id.toString(), this.width / 2 - 50, y, 0xAAAAAA, false);
                y += 12;
                if (y > this.height - 40) break; // Limit display
            }
            context.drawText(this.textRenderer, "Total: " + loadedPaintings.size(), this.width / 2 - 50, y + 10, 0x00FF00, false);
        }
    }
}
