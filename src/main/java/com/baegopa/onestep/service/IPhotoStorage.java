package com.baegopa.onestep.service;

import org.springframework.web.multipart.MultipartFile;

/**
 * 사진 파일을 어디에 둘지 담당한다.
 * <p>
 * 지금은 서버 폴더에 저장하지만, 네이버 클라우드 Object Storage 승인이 나면
 * 이 인터페이스를 구현한 클래스만 새로 만들어 끼우면 된다.
 * 나머지 코드(화면, API, DB)는 저장 위치를 모른다.
 */
public interface IPhotoStorage {

    /**
     * 파일을 저장하고 화면에서 쓸 주소를 돌려준다.
     *
     * @return 저장된 주소와, 나중에 지울 때 쓸 키
     */
    StoredPhoto store(MultipartFile file);

    /** 저장소에서 파일을 지운다. 이미 없으면 조용히 넘어간다. */
    void delete(String storageKey);

    /**
     * @param url        화면에서 그대로 쓰는 이미지 주소
     * @param storageKey 저장소 안에서의 식별자
     */
    record StoredPhoto(String url, String storageKey) {
    }
}
