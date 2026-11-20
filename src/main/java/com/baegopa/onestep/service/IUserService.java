package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.UserDTO;

import java.util.List;
import java.util.Map;

public interface IUserService {

    boolean isLoginIdDuplicated(String loginId);

    boolean isEmailDuplicated(String email);

    boolean isValidLinkCode(String linkCode);

    /**
     * 지금 이 연결코드로 연결할 수 있는지 확인
     */
    void validateLinkCode(String linkCode);

    /**
     * 연결코드 다시 받기 (이용자 전용)
     *
     * @return 새로 만들어진 연결코드
     */
    String reissueLinkCode(Long userId);

    UserDTO login(UserDTO userDTO);

    Map<String, Object> getHomeInfo(Long userId, String userRole);

    String getHelpRequestMessage(Long userId);

    int saveHelpRequestMessage(Long userId, String helpRequestMessage);

    /** 직접 쓴 도움요청 문구 모음 (없으면 빈 목록) */
    List<String> getCustomHelpMessages(Long userId);

    /** 직접 쓴 도움요청 문구 모음을 통째로 바꾼다 (추가·수정·삭제 모두 이걸로) */
    List<String> saveCustomHelpMessages(Long userId, String messagesJson);

    int registerUser(UserDTO userDTO);

    int registerGuardian(UserDTO userDTO, String linkCode);

    UserDTO searchUserIdOrPassword(UserDTO userDTO);

    int newPassword(UserDTO userDTO);
}
