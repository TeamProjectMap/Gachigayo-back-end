package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.RouteDTO;
import com.baegopa.onestep.dto.RoutePhotoDTO;
import com.baegopa.onestep.dto.RouteStepDTO;
import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.mapper.ILinkMapper;
import com.baegopa.onestep.mapper.IRouteMapper;
import com.baegopa.onestep.mapper.IRoutePhotoMapper;
import com.baegopa.onestep.service.IPhotoStorage;
import com.baegopa.onestep.service.IRoutePhotoService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class RoutePhotoService implements IRoutePhotoService {

    /** 한 구간에 너무 많이 쌓이면 이용자가 보기 어렵다 */
    private static final int MAX_PHOTOS_PER_STEP = 3;

    private static final long MAX_FILE_SIZE = 10L * 1024 * 1024;

    private static final List<String> ALLOWED_TYPES =
            Arrays.asList("image/jpeg", "image/png", "image/webp");

    private static final String STEP_TYPE_WALK = "WALK";

    private final IRoutePhotoMapper routePhotoMapper;
    private final IRouteMapper routeMapper;
    private final ILinkMapper linkMapper;
    private final IPhotoStorage photoStorage;

    @Override
    public Map<String, Object> getStepPhotos(Long guardianId, Long routeStepId) {
        RouteStepDTO step = findOwnedStep(guardianId, routeStepId);
        RouteDTO route = routeMapper.getRoute(step.getRouteId());

        Map<String, Object> result = new HashMap<>();
        result.put("routeStepId", step.getRouteStepId());
        result.put("routeId", step.getRouteId());
        result.put("routeName", route == null ? "" : route.getRouteName());
        result.put("stepTitle", isBlank(step.getLineName()) ? step.getMainText() : step.getLineName());
        result.put("walking", STEP_TYPE_WALK.equalsIgnoreCase(step.getStepType()));
        result.put("maxPhotos", MAX_PHOTOS_PER_STEP);
        // 사진에 위치가 아직 없을 때 지도를 어디에 맞출지 쓰는 값
        result.put("stepLat", step.getLat());
        result.put("stepLng", step.getLng());
        result.put("photos", routePhotoMapper.getPhotosByStep(routeStepId));

        return result;
    }

    @Override
    @Transactional
    public RoutePhotoDTO addPhoto(Long guardianId, Long routeStepId, MultipartFile file,
                                  String title, String description,
                                  String latitude, String longitude) {

        RouteStepDTO step = findOwnedStep(guardianId, routeStepId);

        if (!STEP_TYPE_WALK.equalsIgnoreCase(step.getStepType())) {
            throw new IllegalArgumentException("걷는 구간에만 사진을 넣을 수 있습니다.");
        }

        validate(file);

        int photoCount = routePhotoMapper.getPhotoCount(routeStepId);

        if (photoCount >= MAX_PHOTOS_PER_STEP) {
            throw new IllegalArgumentException("한 구간에는 사진을 " + MAX_PHOTOS_PER_STEP + "장까지 넣을 수 있습니다.");
        }

        // 파일을 먼저 저장하고, 주소만 표에 남긴다
        IPhotoStorage.StoredPhoto stored = photoStorage.store(file);

        RoutePhotoDTO photoDTO = new RoutePhotoDTO();
        photoDTO.setRouteStepId(routeStepId);
        photoDTO.setPhotoUrl(stored.url());
        photoDTO.setStorageKey(stored.storageKey());
        photoDTO.setTitle(trimToNull(title));
        photoDTO.setDescription(trimToNull(description));
        photoDTO.setLat(toCoordinate(latitude));
        photoDTO.setLng(toCoordinate(longitude));
        photoDTO.setPhotoOrder(photoCount + 1);

        routePhotoMapper.insertPhoto(photoDTO);

        // 사진을 한 장이라도 남기면 그 구간은 기록된 것으로 본다
        if (!"Y".equals(step.getRecordedYn())) {
            routeMapper.updateStepRecorded(routeStepId, photoDTO.getLat(), photoDTO.getLng());
        }

        routeMapper.touchRoute(step.getRouteId());

        log.info("구간 사진 추가 guardianId={}, routeStepId={}, routePhotoId={}",
                guardianId, routeStepId, photoDTO.getRoutePhotoId());

        return photoDTO;
    }

    @Override
    @Transactional
    public void updatePhotoText(Long guardianId, Long routePhotoId, String title, String description) {
        RoutePhotoDTO photo = findOwnedPhoto(guardianId, routePhotoId);

        routePhotoMapper.updatePhotoText(routePhotoId, trimToNull(title), trimToNull(description));

        RouteStepDTO step = routeMapper.getRouteStep(photo.getRouteStepId());
        if (step != null) {
            routeMapper.touchRoute(step.getRouteId());
        }
    }

    @Override
    @Transactional
    public void updatePhotoLocation(Long guardianId, Long routePhotoId, String latitude, String longitude) {
        RoutePhotoDTO photo = findOwnedPhoto(guardianId, routePhotoId);

        BigDecimal lat = toCoordinate(latitude);
        BigDecimal lng = toCoordinate(longitude);

        if (lat == null || lng == null) {
            throw new IllegalArgumentException("지도에서 위치를 선택해주세요.");
        }

        routePhotoMapper.updatePhotoLocation(routePhotoId, lat, lng);

        // 첫 사진이 그 구간의 위치가 되므로 같이 맞춰준다
        RouteStepDTO step = routeMapper.getRouteStep(photo.getRouteStepId());

        if (step != null) {
            List<RoutePhotoDTO> photos = routePhotoMapper.getPhotosByStep(step.getRouteStepId());

            if (!photos.isEmpty() && routePhotoId.equals(photos.get(0).getRoutePhotoId())) {
                routeMapper.updateStepRecorded(step.getRouteStepId(), lat, lng);
            }

            routeMapper.touchRoute(step.getRouteId());
        }

        log.info("사진 위치 수정 guardianId={}, routePhotoId={}", guardianId, routePhotoId);
    }

    @Override
    @Transactional
    public RoutePhotoDTO replacePhoto(Long guardianId, Long routePhotoId, MultipartFile file,
                                      String latitude, String longitude) {

        RoutePhotoDTO photo = findOwnedPhoto(guardianId, routePhotoId);
        validate(file);

        IPhotoStorage.StoredPhoto stored = photoStorage.store(file);
        String oldKey = photo.getStorageKey();

        routePhotoMapper.updatePhotoFile(routePhotoId, stored.url(), stored.storageKey(),
                toCoordinate(latitude), toCoordinate(longitude));

        // 새 사진이 자리를 잡은 뒤에 예전 파일을 지운다
        photoStorage.delete(oldKey);

        photo.setPhotoUrl(stored.url());
        photo.setStorageKey(stored.storageKey());

        log.info("구간 사진 재촬영 guardianId={}, routePhotoId={}", guardianId, routePhotoId);

        return photo;
    }

    @Override
    public List<RoutePhotoDTO> getPhotosByRoute(Long guardianId, Long routeId) {
        findOwnedRoute(guardianId, routeId);

        return routePhotoMapper.getPhotosByRoute(routeId);
    }

    @Override
    @Transactional
    public void deletePhoto(Long guardianId, Long routePhotoId) {
        RoutePhotoDTO photo = findOwnedPhoto(guardianId, routePhotoId);

        routePhotoMapper.deletePhoto(routePhotoId);

        // 사진이 하나도 안 남으면 그 구간은 다시 "기록 전"으로 되돌린다
        if (routePhotoMapper.getPhotoCount(photo.getRouteStepId()) == 0) {
            routeMapper.updateStepNotRecorded(photo.getRouteStepId());
        }

        // 표에서 지운 뒤에 파일을 지운다. 파일 삭제가 실패해도 목록에는 안 보인다.
        photoStorage.delete(photo.getStorageKey());

        log.info("구간 사진 삭제 guardianId={}, routePhotoId={}", guardianId, routePhotoId);
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("사진을 선택해주세요.");
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("사진은 10MB까지 올릴 수 있습니다.");
        }

        String contentType = file.getContentType();

        if (contentType == null || !ALLOWED_TYPES.contains(contentType.toLowerCase())) {
            throw new IllegalArgumentException("사진 파일만 올릴 수 있습니다. (jpg, png)");
        }
    }

    private RoutePhotoDTO findOwnedPhoto(Long guardianId, Long routePhotoId) {
        RoutePhotoDTO photo = routePhotoId == null ? null : routePhotoMapper.getPhoto(routePhotoId);

        if (photo == null) {
            throw new IllegalArgumentException("사진을 찾을 수 없습니다.");
        }

        findOwnedStep(guardianId, photo.getRouteStepId());

        return photo;
    }

    /** 남의 이용자 경로에 사진을 넣지 못하도록 확인한다 */
    private RouteStepDTO findOwnedStep(Long guardianId, Long routeStepId) {
        RouteStepDTO step = routeStepId == null ? null : routeMapper.getRouteStep(routeStepId);

        if (step == null) {
            throw new IllegalArgumentException("구간을 찾을 수 없습니다.");
        }

        findOwnedRoute(guardianId, step.getRouteId());

        return step;
    }

    private RouteDTO findOwnedRoute(Long guardianId, Long routeId) {
        UserDTO linkedUser = linkMapper.getUserByGuardianId(guardianId);
        RouteDTO route = routeId == null ? null : routeMapper.getRoute(routeId);

        if (linkedUser == null || route == null
                || !linkedUser.getUserId().equals(route.getUserId())) {
            throw new IllegalArgumentException("볼 수 있는 경로가 아닙니다.");
        }

        return route;
    }

    /** 위치 권한을 막아둔 채로 찍을 수도 있어서, 좌표가 없으면 그냥 비워둔다 */
    private BigDecimal toCoordinate(String value) {
        if (isBlank(value)) {
            return null;
        }

        try {
            return new BigDecimal(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String trimToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
