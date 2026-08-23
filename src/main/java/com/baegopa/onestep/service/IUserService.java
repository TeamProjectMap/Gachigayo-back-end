package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.UserDTO;

public interface IUserService {

    boolean isLoginIdDuplicated(String loginId);

    boolean isEmailDuplicated(String email);

    boolean isValidLinkCode(String linkCode);

    UserDTO login(UserDTO userDTO);

    int registerUser(UserDTO userDTO);

    int registerGuardian(UserDTO userDTO, String linkCode);
}
