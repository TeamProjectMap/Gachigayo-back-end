package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.GuardianTripDTO;
import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.mapper.IGuardianMapper;
import com.baegopa.onestep.mapper.ILinkMapper;
import com.baegopa.onestep.mapper.IUserMapper;
import com.baegopa.onestep.service.IHelpCardService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HelpCardService implements IHelpCardService {

    private final IUserMapper userMapper;
    private final ILinkMapper linkMapper;
    private final IGuardianMapper guardianMapper;

    @Override
    public Map<String, Object> getHelpCard(Long userId) {
        Map<String, Object> card = new HashMap<>();

        UserDTO me = userMapper.getUserById(userId);

        if (me != null) {
            card.put("userName", me.getUserName());
        }

        UserDTO guardian = linkMapper.getGuardianByUserId(userId);

        // 보호자가 없어도 카드는 보여준다. 연락처 자리만 비는 것이다.
        if (guardian != null) {
            card.put("guardianName", guardian.getUserName());
            card.put("guardianPhone", guardian.getPhone());
            card.put("relation", linkMapper.getRelationByGuardianId(guardian.getUserId()));
        }

        // 이동 중이면 어디로 가는 중인지 알려주는 게 도와주는 사람에게 가장 쓸모 있다
        GuardianTripDTO trip = guardianMapper.getOngoingTrip(userId);

        if (trip != null) {
            card.put("destination", trip.getEndName());
        }

        return card;
    }
}
