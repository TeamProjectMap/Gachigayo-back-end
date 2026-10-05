package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.RoutePhotoDTO;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

public interface IRoutePhotoService {

    /**
     * 촬영 화면에 필요한 정보 (구간 정보 + 그 구간 사진들)
     */
    Map<String, Object> getStepPhotos(Long guardianId, Long routeStepId);

    /**
     * 도보 구간에 사진을 올린다.
     * <p>
     * 보호자가 이용자와 함께 걸으며 "여기서 건너세요" 같은 지점을 찍어 남긴다.
     * 찍은 자리를 지도에 표시하려고 좌표도 같이 받는다.
     */
    RoutePhotoDTO addPhoto(Long guardianId, Long routeStepId, MultipartFile file,
                           String title, String description, String latitude, String longitude);

    /** 제목·설명 수정 */
    void updatePhotoText(Long guardianId, Long routePhotoId, String title, String description);

    /**
     * 지도에서 사진 위치만 고친다.
     * 집에서 미리 경로를 만들면 GPS가 엉뚱한 자리를 가리키기 때문이다.
     */
    void updatePhotoLocation(Long guardianId, Long routePhotoId, String latitude, String longitude);

    /** 재촬영 — 사진만 바꾸고 제목·설명은 그대로 둔다 */
    RoutePhotoDTO replacePhoto(Long guardianId, Long routePhotoId, MultipartFile file,
                               String latitude, String longitude);

    /** 경로에 달린 사진 전체 (기록 화면에서 한 번에 받아간다) */
    List<RoutePhotoDTO> getPhotosByRoute(Long guardianId, Long routeId);

    /** 사진 삭제 */
    void deletePhoto(Long guardianId, Long routePhotoId);
}
