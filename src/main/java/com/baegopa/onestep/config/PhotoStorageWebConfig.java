package com.baegopa.onestep.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Paths;

/**
 * 서버 폴더에 저장한 사진을 /uploads/... 주소로 열어준다.
 * <p>
 * 클라우드 저장소로 바꾸면 주소가 클라우드 쪽이 되므로 이 설정은 필요 없어진다.
 */
@Configuration
@ConditionalOnProperty(name = "photo.storage.type", havingValue = "local", matchIfMissing = true)
public class PhotoStorageWebConfig implements WebMvcConfigurer {

    @Value("${photo.storage.local-path:uploads}")
    private String localPath;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = Paths.get(localPath).toAbsolutePath().toUri().toString();

        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(location);
    }
}
