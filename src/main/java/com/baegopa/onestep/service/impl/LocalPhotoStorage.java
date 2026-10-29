package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.service.IPhotoStorage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 서버 폴더에 사진을 저장한다.
 * <p>
 * 클라우드 저장소를 쓰기 전까지 쓰는 임시 저장소다.
 * 서버를 각자 PC에서 돌리면 올린 사람 PC에만 파일이 남으니,
 * 여러 명이 같이 볼 때는 클라우드로 바꿔야 한다.
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "photo.storage.type", havingValue = "local", matchIfMissing = true)
public class LocalPhotoStorage implements IPhotoStorage {

    /** 화면에서 이미지를 불러갈 주소 앞부분 */
    private static final String URL_PREFIX = "/uploads/";

    @Value("${photo.storage.local-path:uploads}")
    private String localPath;

    @Override
    public StoredPhoto store(MultipartFile file) {
        // 한 폴더에 파일이 계속 쌓이지 않게 날짜별로 나눈다
        String folder = LocalDate.now().toString();
        String fileName = UUID.randomUUID() + getExtension(file.getOriginalFilename());
        String storageKey = folder + "/" + fileName;

        try {
            Path directory = Paths.get(localPath, folder);
            Files.createDirectories(directory);

            try (var input = file.getInputStream()) {
                Files.copy(input, directory.resolve(fileName), StandardCopyOption.REPLACE_EXISTING);
            }

            log.info("사진 저장 완료 key={}", storageKey);

            return new StoredPhoto(URL_PREFIX + storageKey, storageKey);
        } catch (IOException e) {
            log.error("사진 저장 실패 key={}", storageKey, e);
            throw new IllegalStateException("사진을 저장하지 못했습니다.");
        }
    }

    @Override
    public void delete(String storageKey) {
        if (storageKey == null || storageKey.trim().isEmpty()) {
            return;
        }

        try {
            Files.deleteIfExists(Paths.get(localPath, storageKey));
        } catch (IOException e) {
            // 파일을 못 지워도 목록에서는 사라지는 게 낫다
            log.warn("사진 파일 삭제 실패 key={}", storageKey, e);
        }
    }

    private String getExtension(String originalName) {
        if (originalName == null) {
            return "";
        }

        int dot = originalName.lastIndexOf('.');

        return dot < 0 ? "" : originalName.substring(dot).toLowerCase();
    }
}
