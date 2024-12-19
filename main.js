import { world, system } from '@minecraft/server';
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

/**
 * 길드 시스템 사용법:
 * 
 * 1. 플레이어 명령어:
 *    - !길드: 일반 길드원용 길드 관리 UI를 엽니다.
 *    - !길드장: 길드장용 길드 관리 UI를 엽니다.
 *    - !관리자: 관리자용 길드 관리 UI를 엽니다 ('admin' tag 필요).
 *    - ㅁ [메시지]: 길드 채팅을 보냅니다.
 * 
 * 2. 길드 기능:
 *    - 길드 생성: 새로운 길드를 만들 수 있습니다.
 *    - 길드 가입: 기존 길드에 가입 요청을 보낼 수 있습니다.
 *    - 길드 탈퇴: 현재 소속된 길드에서 탈퇴할 수 있습니다.
 *    - 길드 정보 확인: 모든 길드의 정보를 볼 수 있습니다.
 * 
 * 3. 길드장 기능:
 *    - 길드 정보 수정: 길드 이름과 설명을 변경할 수 있습니다.
 *    - 가입 요청 관리: 길드 가입 요청을 수락하거나 거절할 수 있습니다.
 *    - 길드원 관리: 길드원을 추방할 수 있습니다.
 * 
 * 4. 관리자 기능:
 *    - 길드 삭제: 서버의 모든 길드를 삭제할 수 있습니다.
 * 
 * 5. 기타 기능:
 *    - 길드 채팅: 길드원들끼리 비공개 채팅을 할 수 있습니다.
 *    - 이름 태그: 길드에 가입한 플레이어의 이름 위에 길드 이름이 표시됩니다.
 * 
 * 주의: 이 스크립트를 사용하려면 행동 팩의 manifest.json 파일에 
 * "@minecraft/server"와 "@minecraft/server-ui" 모듈에 대한 종속성을 추가해야 합니다.
 */

// 길드 시스템 초기화
function initGuildSystem() {
    if (!world.getDynamicProperty('guilds')) {
        world.setDynamicProperty('guilds', JSON.stringify({}));
    }
}

// 길드 정보 가져오기
function getGuilds() {
    const guildsData = world.getDynamicProperty('guilds');
    return guildsData ? JSON.parse(guildsData) : {};
}

// 길드 정보 저장하기
function saveGuilds(guilds) {
    world.setDynamicProperty('guilds', JSON.stringify(guilds));
}

// 플레이어의 길드 가져오기
function getPlayerGuild(playerName) {
    const guilds = getGuilds();
    for (const [guildName, guildInfo] of Object.entries(guilds)) {
        if (guildInfo.members.includes(playerName)) {
            return guildName;
        }
    }
    return null;
}

// 길드 구성원을 가져오는 함수
function getGuildMembers(guildName) {
    const guilds = getGuilds();
    if (guilds[guildName] && guilds[guildName].members) {
        // 현재 게임에 있는 모든 플레이어 중 해당 길드 멤버에 해당하는 플레이어를 찾아 반환
        return world.getPlayers().filter(player => guilds[guildName].members.includes(player.name));
    } else {
        return [];
    }
}

// 길드 생성
function createGuild(player, guildName, guildDescription) {
    let guilds = getGuilds();
    if (guilds[guildName]) {
        return false; // 이미 존재하는 길드
    }
    guilds[guildName] = {
        leader: player.name,
        description: guildDescription,
        members: [player.name],
        joinRequests: []
    };
    saveGuilds(guilds);

    // 길드 생성 직후 플레이어의 이름 태그 업데이트
    updatePlayerNameTag(player);

    return true;
}

// 길드 가입 요청 함수
function requestJoinGuild(player, guildName) {
    let guilds = getGuilds();
    if (!guilds[guildName]) {
        return false; // 존재하지 않는 길드
    }
    if (guilds[guildName].members.includes(player.name)) {
        return false; // 이미 가입한 길드
    }
    if (guilds[guildName].joinRequests.includes(player.name)) {
        return false; // 이미 가입 요청을 보낸 상태
    }
    guilds[guildName].joinRequests.push(player.name);
    saveGuilds(guilds);
    return true;
}

// 길드 가입
function joinGuild(player, guildName) {
    let guilds = getGuilds();
    if (!guilds[guildName]) {
        return false; // 존재하지 않는 길드
    }
    if (guilds[guildName].members.includes(player.name)) {
        return false; // 이미 가입한 길드
    }
    guilds[guildName].members.push(player.name);
    saveGuilds(guilds);
    updatePlayerNameTag(player);
    return true;
}

// 길드 탈퇴
function leaveGuild(player) {
    let guilds = getGuilds();
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName) {
        return false; // 입한 길드 없음
    }
    const guild = guilds[playerGuildName];

    if (guild.leader === player.name) {
        // 길드장이 탈퇴하는 경우 길드 해체
        delete guilds[playerGuildName];
        saveGuilds(guilds);

        // 모든 길드원의 이름 태그 초기화
        for (const memberName of guild.members) {
            const member = world.getAllPlayers().find(p => p.name === memberName);
            if (member) {
                updatePlayerNameTag(member);
                member.sendMessage(`§c${playerGuildName} 길드가 해체되었습니다. 길드장이 탈퇴했습니다.`);
            }
        }
    } else {
        // 일반 길드원 탈퇴
        guild.members = guild.members.filter(member => member !== player.name);
        saveGuilds(guilds);
        updatePlayerNameTag(player);
    }
    return true;
}

// 메인 길드 UI
function openGuildUI(player) {
    system.runTimeout(() => {
        const form = new ActionFormData();
        form.title("길드 관리");
        form.body("원하는 작업을 선택하세요.\n길드장은 길드원, 길드버프를 관리할 수 있습니다.");
        form.button("길드 생성\n(길드 생성 비용 100,000원)");
        form.button("길드 가입\n(길드 가입 비용 40,000원)");
        form.button("길드 탈퇴");
        form.button("길드 정보");
        form.button("닫기");

        form.show(player).then((response) => {
            if (response.cancelationReason === "UserBusy") {
                openGuildUI(player);
            } else if (response.canceled) {
                player.sendMessage("길드 관리 UI를 닫았습니다.");
            } else {
                switch (response.selection) {
                    case 0: createGuildUI(player); break;
                    case 1: joinGuildUI(player); break;
                    case 2: leaveGuildUI(player); break;
                    case 3: guildInfoUI(player); break;
                    case 4: player.sendMessage("UI를 닫았습니다."); break;
                }
            }
        }).catch((error) => {
            console.warn("UI 표시 중 오류 발생:", error);
            player.sendMessage("UI를 표시하는 중 오류가 발했습니다.");
        });
    }, 20);
}

// 길드 생성 UI
function createGuildUI(player) {
    const currentGuild = getPlayerGuild(player.name);
    if (currentGuild) {
        player.sendMessage(`이미 ${currentGuild} 길드에 가입되어 있습니다. 새로운 길드를 만들려면 먼저 현재 길드를 탈퇴해야 합니다.`);
        return;
    }

    const form = new ModalFormData()
        .title("길드 생성")
        .textField("길드 이름을 입력하세요:", "길드 이름")
        .textField("길드 설명을 입력하세요:", "길드 설명")
        .toggle("뒤로 가기", false);

    form.show(player).then((response) => {
        if (response.canceled) return;
        const [guildName, guildDescription, goBack] = response.formValues;
        if (goBack) {
            openGuildUI(player);
            return;
        }

        // 금액 조건 검사
        player.runCommandAsync(`scoreboard players test @s money 100000`).then(result => {
            if (result && result.successCount > 0) {
                // 금액 차감
                player.runCommandAsync(`scoreboard players remove @s money 100000`).then(() => {
                    if (createGuild(player, guildName, guildDescription)) {
                        player.sendMessage(`${guildName} 길드를 생성했습니다. 당신이 길드장입니다.`);

                        // 길드 생성 성공 후 이름 태그 업데이트 확인
                        system.runTimeout(() => {
                            updatePlayerNameTag(player);
                        }, 20);
                    } else {
                        player.sendMessage(`${guildName} 길드를 생성할 수 없습니다. 이미 존재하는 이름입니다.`);
                    }
                    openGuildUI(player);
                });
            } else {
                player.sendMessage("길드를 생성하려면 100,000원이 필요합니다.");
            }
        }).catch(error => {
            player.sendMessage("금액 확인 중 오류가 발생했습니다.");
        });
    });
}


// 길드 가입 UI
function joinGuildUI(player) {
    const currentGuild = getPlayerGuild(player.name);
    if (currentGuild) {
        player.sendMessage(`이미 ${currentGuild} 길드에 가입되어 있습니다.`);
        return;
    }

    const guilds = getGuilds();
    const guildList = Object.keys(guilds);
    if (guildList.length === 0) {
        player.sendMessage("현재 가입 가능한 길드가 없습니다.");
        return;
    }

    const form = new ModalFormData()
        .title("길드 가입 요청")
        .dropdown("가입을 요청할 길드를 선택하세요:", guildList)
        .toggle("뒤로 가기", false);

    form.show(player).then((response) => {
        if (response.canceled) return;
        const [selectedIndex, goBack] = response.formValues;
        if (goBack) {
            openGuildUI(player);
            return;
        }

        const selectedGuild = guildList[selectedIndex];

        // 금액 조건 검사
        player.runCommandAsync(`scoreboard players test @s money 40000`).then(result => {
            if (result && result.successCount > 0) {
                // 금액 차감
                player.runCommandAsync(`scoreboard players remove @s money 40000`).then(() => {
                    if (requestJoinGuild(player, selectedGuild)) {
                        player.sendMessage(`${selectedGuild} 길드에 가입 요청을 보냈습니다. 길드장의 승인을 기다려주세요.`);
                    } else {
                        player.sendMessage("가입 요청에 실패했습니다. 이미 요청을 보냈거나 다른 문제가 있을 수 있습니다.");
                    }
                    openGuildUI(player);
                });
            } else {
                player.sendMessage("길드에 가입하려면 40,000원이 필요합니다.");
            }
        }).catch(error => {
            player.sendMessage("금액 확인 중 오류가 발생했습니다.");
        });
    });
}


// 길드 탈퇴 UI
function leaveGuildUI(player) {
    const currentGuild = getPlayerGuild(player.name);
    if (!currentGuild) {
        player.sendMessage("현재 가입한 길드가 없습니다.");
        return;
    }

    const guilds = getGuilds();
    const isLeader = guilds[currentGuild].leader === player.name;

    let message = `정말로 ${currentGuild} 길드에서 탈퇴하시겠습니까?`;
    if (isLeader) {
        message += "\n§c주의: 당신은 길드장입니다. 탈퇴하면 길드가 해체됩니다!";
    }

    const form = new MessageFormData()
        .title("길드 탈퇴")
        .body(message)
        .button1("예")
        .button2("아니오 (뒤로 가기)");

    form.show(player).then((response) => {
        if (response.selection === 0) {
            if (leaveGuild(player)) {
                if (isLeader) {
                    player.sendMessage(`§c${currentGuild} 길드를 해체했습니다.`);
                } else {
                    player.sendMessage(`${currentGuild} 길드에서 탈퇴했습니다.`);
                }
            } else {
                player.sendMessage("길드 탈퇴에 실패했습니다.");
            }
        } else {
            player.sendMessage("길드 탈퇴 했습니다.");
        }
        openGuildUI(player);
    });
}

// 길드 정보 UI
function guildInfoUI(player) {
    try {
        const guilds = getGuilds();

        if (Object.keys(guilds).length === 0) {
            player.sendMessage("§c현재 생성된 길드가 없습니다.");
            return;
        }

        let guildInfo = "§l§6길드 정보§r\n\n";

        const playerGuildName = getPlayerGuild(player.name);
        if (playerGuildName) {
            const playerGuildInfo = guilds[playerGuildName];
            guildInfo += `§l§9당신의 길드:§r\n§e길드: §b${playerGuildName}\n§e설명: §f${playerGuildInfo.description}\n§e길드원: §f${playerGuildInfo.members.join(', ')}\n`;
            if (playerGuildInfo.leader === player.name) {
                guildInfo += "§6(당신은 길드장입니다)\n";
            }
            guildInfo += "\n§l§6다른 길드 목록:§r\n\n";
        } else {
            guildInfo += "§c당신은 현재 어떤 길드에도 속해있지 않습니다.\n\n§l§6길드 목록:§r\n\n";
        }

        for (const [guildName, guildData] of Object.entries(guilds)) {
            if (playerGuildName && guildName === playerGuildName) continue;
            guildInfo += `§e길드: §b${guildName}\n§e길드장: §a${guildData.leader}\n§e설명: §f${guildData.description}\n§e길드원: §f${guildData.members.join(', ')}\n§r\n`;
        }

        const form = new ActionFormData()
            .title("§l§6길드 정보")
            .body(guildInfo)
            .button("확인 (뒤로 가기)");

        form.show(player).then(() => {
            openGuildUI(player);
        });
    } catch (error) {
        console.warn("길드 정보 UI 표시 중 오류 발생:", error);
        player.sendMessage("§c길드 정보를 불러오는 중 오류가 발생했습니다.");
    }
}

// 길드장 UI
function openGuildLeaderUI(player) {
    system.runTimeout(() => {
        const playerGuildName = getPlayerGuild(player.name);
        if (!playerGuildName) {
            player.sendMessage("§c당신은 길드에 속해있지 않습니다.");
            return;
        }

        const guilds = getGuilds();
        if (guilds[playerGuildName].leader !== player.name) {
            player.sendMessage("§c당신은 길드장이 아닙니다.");
            return;
        }

        const form = new ActionFormData();
        form.title("§l§6길드장 관리");
        form.body(`§e${playerGuildName} §f길드의 관리 메뉴입니다.`);
        form.button("길드원 관리");
        form.button("길드 정보 수정");
        form.button("가입 요청 관리");
        form.button("길드 버프"); // 길드 버프 버튼 추가
        form.button("길드 해체");
        form.button("닫기");

        form.show(player).then((response) => {
            if (response.cancelationReason === "UserBusy") {
                openGuildLeaderUI(player);
            } else if (response.canceled) {
                player.sendMessage("길드장 관리 UI를 닫았습니다.");
            } else {
                switch (response.selection) {
                    case 0: manageMembersUI(player); break;
                    case 1: editGuildInfoUI(player); break;
                    case 2: manageJoinRequestsUI(player); break;
                    case 3: openGuildBuffUI(player); break; // 길드 버프 UI로 이동
                    case 4: disbandGuildUI(player); break;
                    case 5: player.sendMessage("UI를 닫았습니다."); break;
                }
            }
        }).catch((error) => {
            console.warn("UI 표시 중 오류 발생:", error);
            player.sendMessage("UI를 표시하는 중 오류가 발생했습니다.");
        });
    }, 20);
}

// 길드 버프 UI
function openGuildBuffUI(player) {
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName) {
        player.sendMessage("§c길드에 속해 있지 않습니다.");
        return;
    }

    const form = new ActionFormData();
    form.title("§l§6길드 버프 구매");
    form.body("길드 버프를 활성화하려면\n아래 버튼을 통해 구매할 수 있습니다.\n구매 시 모든 길드원에게 해당 효과가 부여됩니다.\n§c이미 적용된 효과를 중복구매하지 않도록 주의하세요.\n§c시간이 합산되어 늘어나지 않습니다.");
    form.button("채굴속도 향상 Lv.2(30분) 구매\n(200,000원)");
    form.button("최대체력 20 추가(30분) 구매\n(1,000,000원)"); // 체력 강화 버튼 추가
    form.button("뒤로 가기");

    form.show(player).then((response) => {
        if (response.canceled) return;

        switch (response.selection) {
            case 0: // 채굴 강화 구매 버튼
                checkAndApplyMiningBoost(player, playerGuildName);
                break;
            case 1: // 체력 강화 구매 버튼
                checkAndApplyHealthBoost(player, playerGuildName);
                break;
            case 2: // 뒤로 가기
                openGuildLeaderUI(player);
                break;
        }
    }).catch((error) => {
        console.warn("UI 표시 중 오류 발생:", error);
        player.sendMessage("UI를 표시하는 중 오류가 발생했습니다.");
    });
}

// 금액 검사 및 채굴 강화 효과 적용
function checkAndApplyMiningBoost(player, guildName) {
    player.runCommandAsync(`scoreboard players test @s money 200000`).then(result => {
        if (result && result.successCount > 0) {
            // 금액 차감
            player.runCommandAsync(`scoreboard players remove @s money 200000`).then(() => {
                applyMiningBoostEffectToGuild(guildName);
                player.sendMessage("길드 버프가 활성화되었습니다. 길드원들에게 채굴 강화 효과가 부여되었습니다.");
            });
        } else {
            player.sendMessage("길드 버프를 구매하려면 200,000원이 필요합니다.");
        }
    }).catch(error => {
        console.warn("금액 확인 중 오류 발생:", error);
        player.sendMessage("금액 확인 중 오류가 발생했습니다.");
    });
}

// 길드원들에게 채굴 강화 효과 부여
function applyMiningBoostEffectToGuild(guildName) {
    const guildMembers = getGuildMembers(guildName);
    guildMembers.forEach(member => {
        member.runCommandAsync(`effect ${member.name} haste 1800 1 true`); // 30분(1800초) 동안 채굴 강화 효과 (레벨 2)
        player.sendMessage("길드 버프가 활성되었습니다. 전 길드원들에게 채굴 강화 효과가 부여되었습니다.");
    });
}

// 체력 강화 효과 부여 함수
function checkAndApplyHealthBoost(player, guildName) {
    const cost = 1000000; // 비용 설정
    player.runCommandAsync(`scoreboard players test @s money ${cost}`).then(result => {
        if (result && result.successCount > 0) {
            player.runCommandAsync(`scoreboard players remove @s money ${cost}`); // 돈 차감
            applyHealthBoostEffectToGuild(guildName); // 효과 적용
            player.sendMessage("길드원들에게 체력 20 추가 효과를 30분 동안 적용합니다.");
        } else {
            player.sendMessage("§c금액이 부족합니다. 체력 강화 효과를 구매할 수 없습니다.");
        }
    });
}

// 길드원들에게 체력 강화 효과 부여
function applyHealthBoostEffectToGuild(guildName) {
    const guildMembers = getGuildMembers(guildName);
    guildMembers.forEach(member => {
        member.runCommandAsync(`effect ${member.name} health_boost 1800 4 true`); // 30분(1800초) 동안 체력 강화 효과 (레벨 4)
        player.sendMessage("길드 버프가 활성되었습니다. 전 길드원들에게 체력 강화 효과가 부여되었습니다.");
    });
}


// 길드원 관리 UI
function manageMembersUI(player) {
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName) {
        player.sendMessage("§c당신은 길드에 속해있지 않습니다.");
        return;
    }

    const guilds = getGuilds();
    const guild = guilds[playerGuildName];
    if (guild.leader !== player.name) {
        player.sendMessage("§c당신은 길드장이 아닙니다.");
        return;
    }

    const form = new ActionFormData()
        .title("길드원 관리")
        .body(`${playerGuildName} 길드의 길드원 목록입니다. 탈퇴 시킬 길드원을 선택하세요.`);

    const kickableMembers = guild.members.filter(member => member !== player.name);
    kickableMembers.forEach(member => {
        form.button(member);
    });

    form.button("뒤로 가기");

    form.show(player).then((response) => {
        if (response.canceled || response.selection === kickableMembers.length) {
            openGuildLeaderUI(player);
            return;
        }

        const selectedMember = kickableMembers[response.selection];
        kickMemberConfirmUI(player, selectedMember);
    });
}

// 길드원 추방 확인 UI
function kickMemberConfirmUI(player, memberToKick) {
    const form = new MessageFormData()
        .title("길드원 추방 확인")
        .body(`정말로 ${memberToKick}을(를) 길드에서 추방하시겠습니까?`)
        .button1("예")
        .button2("아니오");

    form.show(player).then((response) => {
        if (response.selection === 0) {
            kickMember(player, memberToKick);
        }
        manageMembersUI(player);
    });
}

// 길드원 추방 함수
function kickMember(player, memberToKick) {
    const guilds = getGuilds();
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName || guilds[playerGuildName].leader !== player.name) {
        player.sendMessage("§c권한이 없습니다.");
        return;
    }

    const guild = guilds[playerGuildName];
    if (memberToKick === player.name) {
        player.sendMessage("§c자기 자신을 추방할 수 없습니다.");
        return;
    }

    if (!guild.members.includes(memberToKick)) {
        player.sendMessage(`§c${memberToKick}은(는) 길드원이 아닙니다.`);
        return;
    }

    guild.members = guild.members.filter(member => member !== memberToKick);
    saveGuilds(guilds);

    player.sendMessage(`§a${memberToKick}을(를) 길드에서 추방했습니다.`);
    const kickedPlayer = world.getAllPlayers().find(p => p.name === memberToKick);
    if (kickedPlayer) {
        kickedPlayer.sendMessage(`§c당신은 ${playerGuildName} 길드에서 추방되었습니다.`);
        updatePlayerNameTag(kickedPlayer);
    }

    // 길드장의 이름 태그는 변경되지 않아야 함
    updatePlayerNameTag(player);
}

// 길드 정보 수정 UI
function editGuildInfoUI(player) {
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName) {
        player.sendMessage("§c당신은 길드에 속해있지 않습니다.");
        return;
    }

    const guilds = getGuilds();
    const guild = guilds[playerGuildName];
    if (guild.leader !== player.name) {
        player.sendMessage("§c당신은 길드장이 아닙니다.");
        return;
    }

    const form = new ModalFormData()
        .title("길드 정보 수정")
        .textField("새로운 길드 이름 (변경하지 않으려면 비워두세요)", "새 길드 이름", playerGuildName)
        .textField("새로운 길드 설명", "새 길드 설명", guild.description);

    form.show(player).then((response) => {
        if (response.canceled) {
            openGuildLeaderUI(player);
            return;
        }

        const [newGuildName, newDescription] = response.formValues;
        updateGuildInfo(player, newGuildName, newDescription);
    });
}

// 길드 정보 업데이트 함수 수정
function updateGuildInfo(player, newGuildName, newDescription) {
    const guilds = getGuilds();
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName || guilds[playerGuildName].leader !== player.name) {
        player.sendMessage("§c권한이 없습니다.");
        return;
    }

    const guild = guilds[playerGuildName];
    let nameChanged = false;

    if (newGuildName && newGuildName !== playerGuildName) {
        if (guilds[newGuildName]) {
            player.sendMessage("§c이미 존재하는 길드 이름입니다.");
            return;
        }
        guilds[newGuildName] = guild;
        delete guilds[playerGuildName];
        player.sendMessage(`§a길드 이름을 ${newGuildName}으로 변경했습니다.`);
        nameChanged = true;
    }

    if (newDescription) {
        guild.description = newDescription;
        player.sendMessage("§a길드 설명을 업데이트했습니다.");
    }

    saveGuilds(guilds);

    // 길드 이름이 변경되었다면 모든 길드원의 이름 태그 업데이트
    if (nameChanged) {
        updateAllGuildMembersTags(newGuildName || playerGuildName);
    }

    openGuildLeaderUI(player);
}

// 모든 길드원의 이름 태그 업데이트 함수
function updateAllGuildMembersTags(guildName) {
    const guilds = getGuilds();
    const guild = guilds[guildName];
    if (!guild) return;

    for (const memberName of guild.members) {
        const member = world.getAllPlayers().find(p => p.name === memberName);
        if (member) {
            updatePlayerNameTag(member);
            member.sendMessage(`§a길드 이름이 '${guildName}'(으)로 변경되었습니다.`);
        }
    }
}

// 길드 해체 확인 UI
function disbandGuildUI(player) {
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName) {
        player.sendMessage("§c당신은 길드에 속해있지 않습니다.");
        return;
    }

    const guilds = getGuilds();
    if (guilds[playerGuildName].leader !== player.name) {
        player.sendMessage("§c당신은 길드장이 아닙니다.");
        return;
    }

    const form = new MessageFormData()
        .title("길드 해체")
        .body(`정말로 ${playerGuildName} 길드를 해체하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)
        .button1("예, 길드를 해체합니다")
        .button2("아니오, 취소합니다");

    form.show(player).then((response) => {
        if (response.selection === 0) {
            disbandGuild(player);
        } else {
            player.sendMessage("길드 해체를 취소했니다.");
            openGuildLeaderUI(player);
        }
    });
}

// 길드 해체 함수
function disbandGuild(player) {
    const guilds = getGuilds();
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName || guilds[playerGuildName].leader !== player.name) {
        player.sendMessage("§c권한이 없습니다.");
        return;
    }

    const guild = guilds[playerGuildName];
    const members = guild.members;

    // 길드 삭제
    delete guilds[playerGuildName];
    saveGuilds(guilds);

    // 모든 길드원에게 알림
    for (const memberName of members) {
        const member = world.getAllPlayers().find(p => p.name === memberName);
        if (member) {
            if (member.name === player.name) {
                member.sendMessage(`§c당신이 ${playerGuildName} 길드를 해체했습니다.`);
            } else {
                member.sendMessage(`§c${playerGuildName} 길드가 길드장에 의해 해체되었습니다.`);
            }
            updatePlayerNameTag(member);
        }
    }

    player.sendMessage(`§a${playerGuildName} 길드를 성공적으로 해체했습니다.`);
}

// 가입 요청 관리 UI
function manageJoinRequestsUI(player) {
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName) {
        player.sendMessage("§c당신은 길드에 속해있지 않습니다.");
        return;
    }

    const guilds = getGuilds();
    const guild = guilds[playerGuildName];
    if (guild.leader !== player.name) {
        player.sendMessage("§c당신은 길드장이 아닙니다.");
        return;
    }

    if (guild.joinRequests.length === 0) {
        player.sendMessage("§c현재 가입 요청이 없습니다.");
        openGuildLeaderUI(player);
        return;
    }

    const form = new ActionFormData()
        .title("가입 요청 관리")
        .body(`${playerGuildName} 길드의 가입 요청 목록입니다. 처리할 요청을 선택하세요.`);

    guild.joinRequests.forEach(requester => {
        form.button(requester);
    });

    form.button("뒤로 가기");

    form.show(player).then((response) => {
        if (response.canceled || response.selection === guild.joinRequests.length) {
            openGuildLeaderUI(player);
            return;
        }

        const selectedRequester = guild.joinRequests[response.selection];
        processJoinRequestUI(player, selectedRequester);
    });
}

// 가입 요청 처리 UI
function processJoinRequestUI(player, requester) {
    const form = new MessageFormData()
        .title("가입 요청 처리")
        .body(`${requester}의 가입 요청을 어떻게 처리하시겠습니까?`)
        .button1("수락")
        .button2("거절");

    form.show(player).then((response) => {
        if (response.selection === 0) {
            acceptJoinRequest(player, requester);
        } else {
            rejectJoinRequest(player, requester);
        }
        manageJoinRequestsUI(player);
    });
}

// 가입 요청 수락 함수
function acceptJoinRequest(player, requester) {
    const guilds = getGuilds();
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName || guilds[playerGuildName].leader !== player.name) {
        player.sendMessage("§c권한이 없습니다.");
        return;
    }

    const guild = guilds[playerGuildName];
    guild.members.push(requester);
    guild.joinRequests = guild.joinRequests.filter(r => r !== requester);
    saveGuilds(guilds);

    player.sendMessage(`§a${requester}의 가입 요청을 수락했습니다.`);
    const newMember = world.getAllPlayers().find(p => p.name === requester);
    if (newMember) {
        newMember.sendMessage(`§a당신의 ${playerGuildName} 길드 가입 요청이 수락되었습니다.`);
        updatePlayerNameTag(newMember);  // 새로운 멤버의 이름 태그 즉시 업데이트
    }

    // 모든 온라인 길드원의 이름 태그 업데이트
    for (const memberName of guild.members) {
        const member = world.getAllPlayers().find(p => p.name === memberName);
        if (member) {
            updatePlayerNameTag(member);
        }
    }
}

// 가입 요청 거절 함수
function rejectJoinRequest(player, requester) {
    const guilds = getGuilds();
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName || guilds[playerGuildName].leader !== player.name) {
        player.sendMessage("§c권한이 없습니다.");
        return;
    }

    const guild = guilds[playerGuildName];
    guild.joinRequests = guild.joinRequests.filter(r => r !== requester);
    saveGuilds(guilds);

    player.sendMessage(`§a${requester}의 가입 요청을 거절했습니다.`);
    const rejectedPlayer = world.getAllPlayers().find(p => p.name === requester);
    if (rejectedPlayer) {
        rejectedPlayer.sendMessage(`§c당신의 ${playerGuildName} 길드 가입 요청이 거절되었습니다.`);
    }
}

// 플레이어의 이름 태그 업데이트
function updatePlayerNameTag(player) {
    const guildName = getPlayerGuild(player.name);
    if (guildName) {
        player.nameTag = `§8[§6${guildName}§8] §f${player.name}`;
    } else {
        player.nameTag = player.name;
    }
}

// 채팅 이벤트 수정
world.beforeEvents.chatSend.subscribe((ev) => {
    const player = ev.sender;
    const message = ev.message;

    if (message === "!길드" || message === "!길드장" || message === "!관리자") {
        ev.cancel = true;
        if (message === "!길드") {
            player.sendMessage(`채팅창을 닫으면 길드 관리 창이 열립니다.`);
            openGuildUI(player);
        } else if (message === "!길드장") {
            player.sendMessage(`채팅창을 닫으면 길드장 관리 창이 열립니다.`);
            openGuildLeaderUI(player);
        } else if (message === "!관리자") {
            if (player.hasTag("admin")) {
                player.sendMessage(`채팅창을 닫으면 관리자 메뉴가 열립니다.`);
                openAdminUI(player);
            } else {
                player.sendMessage("§c이 명령어를 사용할 권한이 없습니다.");
            }
        }
    } else if (message.startsWith('ㅁ')) {
        ev.cancel = true;
        sendGuildMessage(player, message.slice(1).trim());
    } else {
        const guildName = getPlayerGuild(player.name);
        if (guildName) {
            ev.cancel = true;
            world.sendMessage(`§8[§6${guildName}§8] §f${player.name}: ${message}`);
        }
    }
});

// 길드 메시지 전송 함수
function sendGuildMessage(player, message) {
    const guildName = getPlayerGuild(player.name);
    if (!guildName) {
        player.sendMessage("§c당신은 길드에 속해있지 않습니다.");
        return;
    }

    const guilds = getGuilds();
    const guild = guilds[guildName];

    const guildMessage = `§8[§6${guildName}§8] §a[길드] §f${player.name}: ${message}`;

    for (const memberName of guild.members) {
        const member = world.getAllPlayers().find(p => p.name === memberName);
        if (member) {
            member.sendMessage(guildMessage);
        }
    }
}

// 플레이어 스폰 이벤트 (이름 태그 업데이트용)
world.afterEvents.playerSpawn.subscribe((ev) => {
    const player = ev.player;
    system.runTimeout(() => {
        updatePlayerNameTag(player);
    }, 20);
});

// 서버 시작 시 초기화
system.run(() => {
    initGuildSystem();
});

// 관리 UI 열기
function openAdminUI(player) {
    system.runTimeout(() => {
        const form = new ActionFormData();
        form.title("관리자 메뉴");
        form.body("원하는 작업을 선택하세요.");
        form.button("길드 삭제");
        form.button("닫기");

        form.show(player).then((response) => {
            if (response.cancelationReason === "UserBusy") {
                openAdminUI(player);
            } else if (response.canceled) {
                player.sendMessage("관리자 메뉴를 닫았습니다.");
            } else {
                switch (response.selection) {
                    case 0: openGuildDeletionUI(player); break;
                    case 1: player.sendMessage("관리자 메뉴를 닫았습니다."); break;
                }
            }
        }).catch((error) => {
            console.warn("UI 표시 중 오류 발생:", error);
            player.sendMessage("UI를 표시하는 중 오류가 발생했습니다.");
        });
    }, 20);
}

// 길드 삭제 UI 열기
function openGuildDeletionUI(player) {
    system.runTimeout(() => {
        const guilds = getGuilds();
        const guildNames = Object.keys(guilds);

        if (guildNames.length === 0) {
            player.sendMessage("§c삭제할 길드가 없습니다.");
            openAdminUI(player);
            return;
        }

        const form = new ModalFormData()
            .title("길드 삭제")
            .dropdown("삭제할 길드 선택", guildNames)
            .toggle("뒤로 가기", false);

        form.show(player).then((response) => {
            if (response.canceled) {
                openAdminUI(player);
                return;
            }
            const [selectedIndex, goBack] = response.formValues;
            if (goBack) {
                openAdminUI(player);
                return;
            }
            const selectedGuildName = guildNames[selectedIndex];
            deleteGuildConfirmation(player, selectedGuildName);
        }).catch((error) => {
            console.warn("UI 표시 중 오류 발생:", error);
            player.sendMessage("UI를 표시하는 중 오류가 발생했습니다.");
        });
    }, 20);
}

// 길드 삭제 확인 UI
function deleteGuildConfirmation(player, guildName) {
    system.runTimeout(() => {
        const form = new MessageFormData()
            .title("길드 삭제 확인")
            .body(`정말로 '${guildName}' 길드를 삭제하시겠습니까?`)
            .button1("예, 삭제합니다")
            .button2("아니오, 취소합니다");

        form.show(player).then((response) => {
            if (response.selection === 0) {
                deleteGuild(player, guildName);
            } else {
                player.sendMessage("길드 삭제가 취소되었습니다.");
            }
            openAdminUI(player);
        }).catch((error) => {
            console.warn("UI 표시 중 오류 발생:", error);
            player.sendMessage("UI를 표시하는 중 오류가 발생했습니다.");
        });
    }, 20);
}

// 길드 삭제 함수
function deleteGuild(player, guildName) {
    let guilds = getGuilds();
    if (!guilds[guildName]) {
        player.sendMessage(`§c'${guildName}' 길드를 찾을 수 없습니다.`);
        return;
    }

    const guild = guilds[guildName];

    // 모든 길드원에게 알림
    for (const memberName of guild.members) {
        const member = world.getAllPlayers().find(p => p.name === memberName);
        if (member) {
            member.sendMessage(`§c관리자에 의해 '${guildName}' 길드가 삭제되었습니다.`);
            updatePlayerNameTag(member);
        }
    }

    // 길드 삭제
    delete guilds[guildName];
    saveGuilds(guilds);

    player.sendMessage(`§a'${guildName}' 길드를 성공적으로 삭제했습니다.`);
}

const score_id = "money";

// 일정 간격으로 플레이어의 스코어보드값을 약속
system.runInterval(() => {
    world.getDimension("overworld").runCommandAsync(`scoreboard objectives add ${score_id} dummy`);
    world.getDimension("overworld").runCommandAsync(`scoreboard players add @a ${score_id} 0`);
}, 2)

world.afterEvents.itemUse.subscribe((data) => {
    const item = data.itemStack;
    const player = data.source;
    if (item.typeId === "minecraft:compass") {
        main(player)
    }
});

export function main(player) {
    const guilds = getGuilds();
    const playerGuildName = getPlayerGuild(player.name);
    if (!playerGuildName) {
        const formData = new ActionFormData();
        formData.title('LTS 2024 Winter').body('아래 기능 중에서 선택해주세요.');
        formData.button(`어디서나 ATM 서비스`)
        formData.button(`나만의 순간이동장치`)
        formData.button(`나만의 칭호 설정`)
        formData.button(`길드 설정`)

        formData.show(player).then(response => {
            if (response.canceled) return;

            if (response.selection == 0) {
                bank(player)
            } else if (response.selection == 1) {
                showForm(player)
            } else if (response.selection == 2) {
                rankMain(player)
            } else if (response.selection == 3) {
                openGuildUI(player)
            }

        })
        return;
    }
    if (guilds[playerGuildName].leader !== player.name) {
        const formData = new ActionFormData();
        formData.title('LTS 2024 Winter').body('아래 기능 중에서 선택해주세요.');
        formData.button(`어디서나 ATM 서비스`)
        formData.button(`나만의 순간이동장치`)
        formData.button(`나만의 칭호 설정`)
        formData.button(`길드 설정`)

        formData.show(player).then(response => {
            if (response.canceled) return;

            if (response.selection == 0) {
                bank(player)
            } else if (response.selection == 1) {
                showForm(player)
            } else if (response.selection == 2) {
                rankMain(player)
            } else if (response.selection == 3) {
                openGuildUI(player)
            }

        })
    } else {
        const formData = new ActionFormData();
        formData.title('LTS 2024 Winter').body('아래 기능 중에서 선택해주세요.');
        formData.button(`어디서나 ATM 서비스`)
        formData.button(`나만의 순간이동장치`)
        formData.button(`나만의 칭호 설정`)
        formData.button(`길드 설정`)
        formData.button(`길드장 설정`)

        formData.show(player).then(response => {
            if (response.canceled) return;

            if (response.selection == 0) {
                bank(player)
            } else if (response.selection == 1) {
                showForm(player)
            } else if (response.selection == 2) {
                rankMain(player)
            } else if (response.selection == 3) {
                openGuildUI(player)
            } else if (response.selection == 4) {
                openGuildLeaderUI(player)
            }

        })
    }

};

// 아이템 사용 이벤트를 구독하여 컴퍼스 사용 시 은행 UI를 열어주는 함수
export function bank(player) {

    const formData = new ActionFormData();
    formData.title('어디서나 ATM 서비스').body('아래 기능 중에서 선택해주세요.');
    formData.button(`송금하기`)
    formData.button(`계좌확인하기`)
    formData.button('재화입금하기')
    formData.show(player).then(response => {
        if (response.canceled) return;

        if (response.selection == 0) {
            send_money(player)
        } else if (response.selection == 1) {
            player.sendMessage(`${player.name}님의 계좌 잔액은 ${getScore(player)}원입니다`)
        } else if (response.selection == 2) {
            shopForm(player)
        }
    })
};

// 현금 입금 함수
export function shopForm(player) {

    const formData = new ActionFormData();
    const itemList = ["다이아몬드(개당 20000원)", "철(개당 1000원)"];

    formData.title('LTS 간편한 ATM').body('입금하실 재화를 선택해주세요.');

    itemList.forEach((item) => {
        formData.button(item);
    });

    formData.show(player).then(response => {
        if (response.canceled) {
            return;
        } else {
            let selectedItem = itemList[response.selection];
            let price = getPrice(selectedItem); // 선택된 아이템에 따른 가격 가져오기
            buyForm(player, selectedItem, price); // 가격 정보를 buyForm 함수에 전달
        }
    });
}

// 선택된 아이템에 따라 가격 가져오기 //<------------------이 부분 추가하거나 수정하기
function getPrice(item) {
    if (item === "다이아몬드(개당 20000원)") {
        return 20000; // 가격
    } else if (item === "철(개당 1000원)") {
        return 1000; // 가격
    }
    return 0; // 기본적으로 가격을 0으로 설정
}

// 구매 UI 보여주기 
export function buyForm(player, item, price) {
    const formData = new ModalFormData();
    let item_en = getItemEn(item); // 선택된 아이템에 따른 영문 아이템 ID 가져오기
    let maxQuantity = 1;

    // 아이템 개수를 확인하는 함수
    const checkItemQuantity = (quantity) => {
        player.runCommandAsync(`execute if entity @s[hasitem={item=${item_en}, quantity=${quantity}..}]`)
            .then((result) => {
                if (result && result.successCount > 0) {
                    // 수량이 존재하면 maxQuantity 업데이트하고 다음 수량 확인
                    maxQuantity = quantity;
                    checkItemQuantity(quantity + 1);
                } else {
                    // 수량이 없으면 폼 생성
                    createForm();
                }
            })
            .catch((error) => {
                player.sendMessage(`아이템 수량 확인 중 오류가 발생했습니다: ${error}`);
            });
    };

    // 폼을 생성하여 표시하는 함수
    const createForm = () => {
        formData.title(`${item} 입금`);
        formData.slider(`입금하려는 ${item}의 수량을 설정하세요.`, 1, maxQuantity, 1);

        formData.show(player).then(({ formValues }) => {
            const quantity = formValues[0];
            const totalPrice = quantity * price;

            // 아이템 수량을 체크하기 위해 다시 실행 명령어로 확인
            player.runCommandAsync(`execute if entity @s[hasitem={item=${item_en}, quantity=${quantity}..}]`).then((result) => {
                if (result && result.successCount > 0) {
                    // 아이템이 충분히 있을 때만 실행
                    player.runCommandAsync(`clear @s ${item_en} 0 ${quantity}`);
                    player.runCommandAsync(`scoreboard players add @s money ${totalPrice}`);
                    player.runCommandAsync(`title @s actionbar ${totalPrice}원 상당의 ${item}을(를) 입금했습니다`);
                    player.sendMessage(`${player.name}님의 계좌 잔액은 ${getScore(player)}+${totalPrice}원입니다`);
                } else {
                    // 아이템이 부족할 경우 메시지 표시
                    player.sendMessage(`입금하려는 ${item}의 수량이 부족합니다. ${quantity}개가 필요합니다.`);
                }
            }).catch((error) => {
                player.sendMessage(`명령어 실행 중 오류가 발생했습니다: ${error}`);
            });
        });
    };

    // 아이템 수량 확인을 시작
    checkItemQuantity(1);
}


// 선택된 아이템에 따른 영문 아이템 ID 가져오기 //<------------------이 부분 추가하거나 수정하기
function getItemEn(item) {
    if (item === "다이아몬드(개당 20000원)") {
        return "diamond";
    } else if (item === "철(개당 1000원)") {
        return "iron_ingot";
    }
    return ""; // 기본적으로 아이템 ID를 빈 문자열로 설정
}

// 송금 UI 함수
export function send_money(player) {

    const formData = new ModalFormData();
    const players = world.getAllPlayers().map(player => player.name)
    formData.title('송금 하기');
    formData.dropdown("송금할 플레이어를 선택하세요.", players)
    formData.textField("송금 금액을 입력하세요.", "1~1000000")


    // 플레이어에게 은행 UI를 표시하고 사용자 선택에 따라 처리
    formData.show(player).then(({ formValues }) => {

        const received_player = players[formValues[0]]; //formValues[0]은 드롭다운 메뉴에서 선택된 플레이어의 인덱스
        const money = formValues[1]; // formValues[1]은 사용자가 입력한 송금 금액

        if (received_player == player.name) {//선택한 플레이어가 자신이라면
            player.sendMessage(`자신에게는 송금을 할수없습니다.`)
        } else if (money.length == 0) {//입력칸이 비어있다면
            player.sendMessage(`송금금액 입력칸이 비어있습니다.`)
        } else if (money < 1 || money > 1000000) {//입력값이 유효하지않다면
            player.sendMessage(`${money}는 유효하지않은 송금금액입니다.`)
        } else if (!/[0-9]/g.test(money)) {//숫자정규식을 사용해 만약에 텍스트필드에 들어간게 숫자가 아니라면
            player.sendMessage(`송금금액에 숫자가 아닌 문자가 들어가있습니다.`)
        } else if (money > getScore(player)) {//보낼수 있는 돈이 없다면
            player.sendMessage(`보낼수있는 돈이 없습니다.`)
        } else {
            // 송금 처리: 송금자의 잔액에서 송금 금액을 빼고, 수취자의 잔액에 송금 금액을 추가
            player.runCommandAsync(`scoreboard players remove @s ${score_id} ${money}`)
            player.runCommandAsync(`scoreboard players add "${received_player}" ${score_id} ${money}`)
            player.runCommandAsync(`tellraw "${received_player}" {"rawtext":[{"text":"${player.name}님이 ${money}원을 송금했습니다."}]}`)
            player.sendMessage(`${received_player}님에게 ${money}원을 보냈습니다.`)
        }
    })
}

//스코어보드값을 가져오는 함수
function getScore(player) {
    return world.scoreboard.getObjective(score_id).getScore(player)
}


// 각 플레이어의 위치를 저장하기 위한 객체
let playerPositions = {};
let spawnPositions = { x: 66, y: 63, z: 22 };


// UI 설정
function showForm(player) {
    const formData = new ActionFormData();

    formData.title("순간 이동 장치").body("아래 목록을 이용하여 순간이동을 간편하게!");
    formData.button("임시 저장위치를 현재 위치로 저장하기\n(게임 재접속시 삭제됨)");
    formData.button("임시 저장 위치로 이동하기");
    formData.button("중앙마을로 이동하기\n(타 차원일시 유의)");
    formData.button("원하는 플레이어에게로 이동하기");

    formData.show(player).then((response) => {
        if (response.canceled) {
            return;
        }

        // 위치 저장하기 
        if (response.selection === 0) {
            playerPositions[player.name] = {
                x: player.location.x,
                y: player.location.y,
                z: player.location.z
            };

            player.runCommandAsync("title @s actionbar 위치 저장 완료");
        }

        // 위치로 이동하기
        if (response.selection === 1) {
            const position = playerPositions[player.name];

            if (!position) {
                player.runCommandAsync("title @s actionbar 저장된 장소가 없음");
            } else {
                player.runCommandAsync(`tp @s ${position.x} ${position.y} ${position.z}`);
                player.runCommandAsync("title @s actionbar 이동 완료");
            }
        }

        // 스폰 위치로 이동하기
        if (response.selection === 2) {
            const position = spawnPositions;

            if (!position) {
                player.runCommandAsync("title @s actionbar 저장된 장소가 없음");
            } else {
                // 오버월드 차원으로 설정하고 특정 좌표로 이동
                player.runCommandAsync(`tp @s ${position.x} ${position.y} ${position.z}`);
                player.runCommandAsync("title @s actionbar 이동 완료");
            }
        }

        // 원하는 플레이어 위치로 이동하기
        if (response.selection === 3) {
            move(player)
        }
    });
}

// 송금 UI 함수
export function move(player) {

    const formData = new ModalFormData();
    const players = world.getAllPlayers().map(player => player.name)
    formData.title('원하는 플레이어 위치로 이동 하기');
    formData.dropdown("이동하실 대상 플레이어를 선택하세요.", players)


    // 플레이어에게 은행 UI를 표시하고 사용자 선택에 따라 처리
    formData.show(player).then(({ formValues }) => {

        const received_player = players[formValues[0]]; //formValues[0]은 드롭다운 메뉴에서 선택된 플레이어의 인덱스

        // 처리: 송금자의 잔액에서 송금 금액을 빼고, 수취자의 잔액에 송금 금액을 추가
        player.runCommandAsync(`tp @s "${received_player}"`)
        player.runCommandAsync(`title @s actionbar ${received_player}에게로 이동 완료`);
        player.runCommandAsync(`tellraw "${received_player}" {"rawtext":[{"text":"${player.name}님이 당신에게 이동했습니다."}]}`)
    })
}



// 칭호 메인 UI 함수
export function rankMain(player) {

    const formData = new ActionFormData();

    formData.title('칭호 메인').body('밑에 기능에서 선택해주세요..');

    formData.button(`칭호 설정`)
    formData.button(`칭호 삭제`)

    formData.show(player).then(response => {
        if (response.canceled) return;

        if (response.selection == 0) {
            setRank(player)
        } else if (response.selection == 1) {
            removeRank(player)
        }
    })
};

// 칭호 설정 UI 함수
export function setRank(player) {

    const formData = new ModalFormData();

    formData.title('칭호 설정');
    formData.textField("칭호를 설정하세요", "칭호를 입력해주세요")
    formData.show(player).then(({ formValues }) => {
        if (formValues[0].length == 0) {
            player.sendMessage(`칭호는 1글자 이상이여야합니다`)
        } else if (formValues[0].length > 10) {
            player.sendMessage(`칭호는 최대 10글자 입니다.`)
        } else {
            player.setDynamicProperty(`rank`, formValues[0])
            player.sendMessage(`칭호가 ${formValues[0]}으로 설정되었습니다.`)
        }
    })
}

// 칭호 삭제 UI 함수
export function removeRank(player) {

    const formData = new MessageFormData();

    formData.title('칭호 삭제').body('정말 칭호를 삭제하시겠습니까?');

    formData.button1(`아니요`)//0
    formData.button2(`네`)//1

    formData.show(player).then(response => {
        if (response.canceled) return;

        if (response.selection == 1) {
            player.sendMessage(`칭호를 삭제했습니다.`)
            player.setDynamicProperty(`rank`,)
        }
    })
};


// 이자카야 사장
export function izakaya(player) {
    const formData = new ActionFormData();

    formData.title('이자카야 사장').body('최상의 서비스로 보답드리겠습니다.');

    formData.button(`재생포션(Lv.2) 1개 구매\n(100,000원)`);
    formData.button(`익힌 스테이크 32개 구매\n(10,000원)`);
    formData.button(`익힌 연어 32개 구매\n(7,000원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 100000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 100000`); // 돈 차감
                    player.runCommandAsync(`give @s potion 1 22`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 재생포션(Lv.2) 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 1) {
            player.runCommandAsync(`scoreboard players test @s money 10000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 10000`); // 돈 차감
                    player.runCommandAsync(`give @s cooked_beef 32`); // 스테이크 주기
                    player.runCommandAsync(`title @s actionbar 익힌 스테이크 32개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 2) {
            player.runCommandAsync(`scoreboard players test @s money 7000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 7000`); // 돈 차감
                    player.runCommandAsync(`give @s cooked_salmon 32`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 익힌 연어 32개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 야키토리 사장
export function yakitori(player) {
    const formData = new ActionFormData();

    formData.title('야키토리 사장').body('싸다! 맛있다! 건강하다!');

    formData.button(`익힌 닭고기 5개 구매\n(900원)`);
    formData.button(`익힌 토끼고기 5개 구매\n(700원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 900`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 900`); // 돈 차감
                    player.runCommandAsync(`give @s cooked_chicken 5`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 익힌 닭고기 5개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 1) {
            player.runCommandAsync(`scoreboard players test @s money 700`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 700`); // 돈 차감
                    player.runCommandAsync(`give @s cooked_rabbit 5`); // 스테이크 주기
                    player.runCommandAsync(`title @s actionbar 익힌 토끼고기 5개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 특수물품가게 사장
export function unique(player) {
    const formData = new ActionFormData();

    formData.title('특수물품가게 사장').body('살 수 있으면 사 봐. 줄테니.');

    formData.button(`겉날개 1개 구매\n(3,000,000원)`);
    formData.button(`불사의토템 1개 구매\n(1,000,000원)`);
    formData.button(`다이아몬드말방어구 1개 구매\n(500,000원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 3000000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 3000000`); // 돈 차감
                    player.runCommandAsync(`give @s elytra 1`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 겉날개 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 1) {
            player.runCommandAsync(`scoreboard players test @s money 1000000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 1000000`); // 돈 차감
                    player.runCommandAsync(`give @s totem_of_undying 1`); // 스테이크 주기
                    player.runCommandAsync(`title @s actionbar 불사의 토템 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 2) {
            player.runCommandAsync(`scoreboard players test @s money 500000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 500000`); // 돈 차감
                    player.runCommandAsync(`give @s diamond_horse_armor 1`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 다이아몬드말방어구 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 폭죽가게 사장
export function firework(player) {
    const formData = new ActionFormData();

    formData.title('위험한 것을 파는 상인').body('이 정도면 합리적인 가격.');

    formData.button(`폭죽로켓 64개 구매\n(30,000원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 30000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 30000`); // 돈 차감
                    player.runCommandAsync(`give @s firework_rocket 64`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 폭죽로켓 64개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 중화요리 사장
export function chinese(player) {
    const formData = new ActionFormData();

    formData.title('중화요리 음식점 사장').body('어서오세요! 여러 개의 중국을 지지합니다.');

    formData.button(`익힌 양고기 16개 구매\n(3,500원)`);
    formData.button(`뼈다귀 32개 구매\n(10,000원)`);
    formData.button(`발광먹물주머니 10개 구매\n(10,000원)`);
    formData.button(`독화살(15초) 16개 구매\n(10,000원)`);
    formData.button(`고통의화살(피해 Lv.2) 16개 구매\n(10,000원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 3500`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 3500`); // 돈 차감
                    player.runCommandAsync(`give @s cooked_mutton 16`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 익힌 양고기 16개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 1) {
            player.runCommandAsync(`scoreboard players test @s money 10000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 10000`); // 돈 차감
                    player.runCommandAsync(`give @s bone 32`); // 스테이크 주기
                    player.runCommandAsync(`title @s actionbar 뼈다귀 32개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 2) {
            player.runCommandAsync(`scoreboard players test @s money 10000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 10000`); // 돈 차감
                    player.runCommandAsync(`give @s glow_ink_sak 10`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 발광먹물주머니 10개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 3) {
            player.runCommandAsync(`scoreboard players test @s money 10000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 10000`); // 돈 차감
                    player.runCommandAsync(`give @s arrow 16 27`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 독화살(15초) 16개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 4) {
            player.runCommandAsync(`scoreboard players test @s money 10000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 10000`); // 돈 차감
                    player.runCommandAsync(`give @s arrow 16 25`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 고통의화살(피해Lv.2) 16개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 삼겹살가게 사장
export function chuksan(player) {
    const formData = new ActionFormData();

    formData.title('삼겹살가게 사장').body('대한민국의 맛을 보장하겠습니다.');

    formData.button(`익힌 돼지고기 10개 구매\n(3,500원)`);
    formData.button(`숯 32개 구매\n(10,000원)`);
    formData.button(`사탕수수 32개 구매\n(12,000원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 3500`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 3500`); // 돈 차감
                    player.runCommandAsync(`give @s cooked_porkchop 10`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 익힌 돼지고기 10개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 1) {
            player.runCommandAsync(`scoreboard players test @s money 10000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 10000`); // 돈 차감
                    player.runCommandAsync(`give @s charcoal 32`); // 스테이크 주기
                    player.runCommandAsync(`title @s actionbar 숯 32개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 2) {
            player.runCommandAsync(`scoreboard players test @s money 12000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 12000`); // 돈 차감
                    player.runCommandAsync(`give @s sugar_cane 32`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 사탕수수 32개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 아메리칸다이닝 사장
export function american(player) {
    const formData = new ActionFormData();

    formData.title('American Dining Store').body('Thanks for stopping!');

    formData.button(`빵 64개 구매\n(10,000원)`);
    formData.button(`호박파이 32개 구매\n(10,000원)`);
    formData.button(`황금사과 1개 구매\n(100,000원)`);
    formData.button(`황금사과 10개 구매\n(800,000원) *판매자 추천 상품!*`);
    formData.button(`인챈트된 황금사과 1개 구매\n(1,000,000원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 10000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 10000`); // 돈 차감
                    player.runCommandAsync(`give @s bread 64`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 빵 64개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 1) {
            player.runCommandAsync(`scoreboard players test @s money 10000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 10000`); // 돈 차감
                    player.runCommandAsync(`give @s pumpkin_pie 32`); // 스테이크 주기
                    player.runCommandAsync(`title @s actionbar 호박파이 32개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 2) {
            player.runCommandAsync(`scoreboard players test @s money 100000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 100000`); // 돈 차감
                    player.runCommandAsync(`give @s golden_apple 1`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 황금사과 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 3) {
            player.runCommandAsync(`scoreboard players test @s money 800000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 800000`); // 돈 차감
                    player.runCommandAsync(`give @s golden_apple 10`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 황금사과 10개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 4) {
            player.runCommandAsync(`scoreboard players test @s money 1000000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 1000000`); // 돈 차감
                    player.runCommandAsync(`give @s enchanted_golden_apple 1`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 인챈트된 황금사과 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 귀금속가게 사장
export function golddiamond(player) {
    const formData = new ActionFormData();

    formData.title('귀금속가게 사장').body('저렴한 가격이니 의심말고 클릭!');

    formData.button(`철괴 32개 구매\n(40,000원)`);
    formData.button(`금괴 32개 구매\n(550,000원)`);
    formData.button(`다이아몬드 10개 구매\n(280,000원)`);
    formData.button(`철괴 1개 구매\n(1,300원)`);
    formData.button(`금괴 1개 구매\n(18,000원)`);
    formData.button(`다이아몬드 1개 구매\n(30,000원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 40000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 40000`); // 돈 차감
                    player.runCommandAsync(`give @s iron_ingot 32`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 철괴 32개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 1) {
            player.runCommandAsync(`scoreboard players test @s money 550000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 550000`); // 돈 차감
                    player.runCommandAsync(`give @s gold_ingot 32`); // 스테이크 주기
                    player.runCommandAsync(`title @s actionbar 금괴 32개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 2) {
            player.runCommandAsync(`scoreboard players test @s money 280000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 280000`); // 돈 차감
                    player.runCommandAsync(`give @s diamond 10`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 다이아몬드 10개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 3) {
            player.runCommandAsync(`scoreboard players test @s money 1300`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 1300`); // 돈 차감
                    player.runCommandAsync(`give @s iron_ingot 1`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 철괴 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 4) {
            player.runCommandAsync(`scoreboard players test @s money 18000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 18000`); // 돈 차감
                    player.runCommandAsync(`give @s gold_ingot 1`); // 스테이크 주기
                    player.runCommandAsync(`title @s actionbar 금괴 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 5) {
            player.runCommandAsync(`scoreboard players test @s money 30000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 30000`); // 돈 차감
                    player.runCommandAsync(`give @s diamond 1`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 다이아몬드 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

function getmachineprice(item) {
    if (item === "일광탐지기(개당 1,000원)") {
        return 1000; // 가격
    } else if (item === "호퍼(개당 5,000원)") {
        return 5000; // 가격
    } else if (item === "피스톤(개당 1,200원)") {
        return 1200; // 가격
    } else if (item === "끈끈이피스톤(개당 1,500원)") {
        return 1500; // 가격
    }
    return 0; // 기본적으로 가격을 0으로 설정
}

// 기계부품가게 사장
export function machine(player) {
    const formData = new ModalFormData();
    const list = ["일광탐지기(개당 1,000원)", "호퍼(개당 5,000원)", "피스톤(개당 1,200원)", "끈끈이피스톤(개당 1,500원)"];
    formData.title('기계부품가게 사장');
    formData.dropdown("구매하실 물품을 선택하세요.", list)
    formData.slider(`구매하려는 수량을 설정하세요.`, 1, 32, 1);

    formData.show(player).then(response => {
        if (response.canceled) {
            return;
        } else {
            let item = list[response.formValues[0]]; // 선택된 아이템의 인덱스 사용
            let machine_en = getmachineitemen(item); // 선택된 아이템에 따른 영문 아이템 ID 가져오기
            let price = getmachineprice(item); // 선택된 아이템에 따른 가격 가져오기

            const quantity = response.formValues[1]; // 선택된 수량 가져오기
            const totalPrice = quantity * price;

            player.runCommandAsync(`scoreboard players test @s money ${totalPrice}`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money ${totalPrice}`); // 돈 차감
                    player.runCommandAsync(`give @s ${machine_en} ${quantity}`); // 아이템 주기
                    player.runCommandAsync(`title @s actionbar ${item} ${quantity}개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 선택된 아이템에 따른 영문 아이템 ID 가져오기
function getmachineitemen(item) {
    if (item === "일광탐지기(개당 1,000원)") {
        return "daylight_detector";
    } else if (item === "호퍼(개당 5,000원)") {
        return "hopper";
    } else if (item === "피스톤(개당 1,200원)") {
        return "piston";
    } else if (item === "끈끈이피스톤(개당 1,500원)") {
        return "sticky_piston";
    }
    return ""; // 기본적으로 아이템 ID를 빈 문자열로 설정
}

//전기부품가게
function getelectricprice(item) {
    if (item === "레드스톤 가루(개당 400원)") {
        return 400; // 가격
    } else if (item === "레스스톤 중계기(개당 700원)") {
        return 700; // 가격
    } else if (item === "레드스톤 비교기(개당 700원)") {
        return 700; // 가격
    } else if (item === "레드스톤 조명(개당 2,000원)") {
        return 2000; // 가격
    }
    return 0; // 기본적으로 가격을 0으로 설정
}

// 전기부품가게 사장
export function electric(player) {
    const formData = new ModalFormData();
    const list = ["레드스톤 가루(개당 400원)", "레스스톤 중계기(개당 700원)", "레드스톤 비교기(개당 700원)", "레드스톤 조명(개당 2,000원)"];
    formData.title('전기부품가게 사장');
    formData.dropdown("구매하실 물품을 선택하세요.", list)
    formData.slider(`구매하려는 수량을 설정하세요.`, 1, 32, 1);

    formData.show(player).then(response => {
        if (response.canceled) {
            return;
        } else {
            let item = list[response.formValues[0]]; // 선택된 아이템의 인덱스 사용
            let electric_en = getelectricitemen(item); // 선택된 아이템에 따른 영문 아이템 ID 가져오기
            let price = getelectricprice(item); // 선택된 아이템에 따른 가격 가져오기

            const quantity = response.formValues[1]; // 선택된 수량 가져오기
            const totalPrice = quantity * price;

            player.runCommandAsync(`scoreboard players test @s money ${totalPrice}`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money ${totalPrice}`); // 돈 차감
                    player.runCommandAsync(`give @s ${electric_en} ${quantity}`); // 아이템 주기
                    player.runCommandAsync(`title @s actionbar ${item} ${quantity}개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 선택된 아이템에 따른 영문 아이템 ID 가져오기
function getelectricitemen(item) {
    if (item === "레드스톤 가루(개당 400원)") {
        return "redstone";
    } else if (item === "레스스톤 중계기(개당 700원)") {
        return "repeater";
    } else if (item === "레드스톤 비교기(개당 700원)") {
        return "comparator";
    } else if (item === "레드스톤 조명(개당 2,000원)") {
        return "redstone_lamp";
    }
    return ""; // 기본적으로 아이템 ID를 빈 문자열로 설정
}

//책가게
function getbookstoreprice(item) {
    if (item === "책(개당 2,000원)") {
        return 2000; // 가격
    } else if (item === "경험치병(개당 1,000원)") {
        return 1000; // 가격
    }
    return 0; // 기본적으로 가격을 0으로 설정
}

// 책가게 사장
export function bookstore(player) {
    const formData = new ModalFormData();
    const list = ["책(개당 2,000원)", "경험치병(개당 1,000원)"];
    formData.title('책가게 사장');
    formData.dropdown("구매하실 물품을 선택하세요.", list)
    formData.slider(`구매하려는 수량을 설정하세요.`, 0, 64, 2);

    formData.show(player).then(response => {
        if (response.canceled) {
            return;
        } else {
            let item = list[response.formValues[0]]; // 선택된 아이템의 인덱스 사용
            let bookstore_en = getbookstoreitemen(item); // 선택된 아이템에 따른 영문 아이템 ID 가져오기
            let price = getbookstoreprice(item); // 선택된 아이템에 따른 가격 가져오기

            const quantity = response.formValues[1]; // 선택된 수량 가져오기
            const totalPrice = quantity * price;

            player.runCommandAsync(`scoreboard players test @s money ${totalPrice}`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money ${totalPrice}`); // 돈 차감
                    player.runCommandAsync(`give @s ${bookstore_en} ${quantity}`); // 아이템 주기
                    player.runCommandAsync(`title @s actionbar ${item} ${quantity}개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 선택된 아이템에 따른 영문 아이템 ID 가져오기
function getbookstoreitemen(item) {
    if (item === "책(개당 2,000원)") {
        return "book";
    } else if (item === "경험치병(개당 1,000원)") {
        return "experience_bottle";
    }
    return ""; // 기본적으로 아이템 ID를 빈 문자열로 설정
}

//원목가게

function getwoodprice(item) {
    if (item === "참나무 원목(개당 150원)") {
        return 150; // 가격
    } else if (item === "자작나무 원목(개당 150원)") {
        return 150; // 가격
    } else if (item === "가문비나무 원목(개당 150원)") {
        return 150; // 가격
    } else if (item === "정글나무 원목(개당 180원)") {
        return 180; // 가격
    } else if (item === "아카시아나무 원목(개당 180원)") {
        return 180; // 가격
    }
    return 0; // 기본적으로 가격을 0으로 설정
}

// 원목가게 사장
export function wood(player) {
    const formData = new ModalFormData();
    const list = ["참나무 원목(개당 150원)", "자작나무 원목(개당 150원)", "가문비나무 원목(개당 150원)", "정글나무 원목(개당 180원)", "아카시아나무 원목(개당 180원)"];
    formData.title('수입원목가게 사장');
    formData.dropdown("구매하실 물품을 선택하세요.", list)
    formData.slider(`구매하려는 수량을 설정하세요.`, 0, 256, 8);

    formData.show(player).then(response => {
        if (response.canceled) {
            return;
        } else {
            let item = list[response.formValues[0]]; // 선택된 아이템의 인덱스 사용
            let wood_en = getwooditemen(item); // 선택된 아이템에 따른 영문 아이템 ID 가져오기
            let price = getwoodprice(item); // 선택된 아이템에 따른 가격 가져오기

            const quantity = response.formValues[1]; // 선택된 수량 가져오기
            const totalPrice = quantity * price;

            player.runCommandAsync(`scoreboard players test @s money ${totalPrice}`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money ${totalPrice}`); // 돈 차감
                    player.runCommandAsync(`give @s ${wood_en} ${quantity}`); // 아이템 주기
                    player.runCommandAsync(`title @s actionbar ${item} ${quantity}개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 선택된 아이템에 따른 영문 아이템 ID 가져오기
function getwooditemen(item) {
    if (item === "참나무 원목(개당 150원)") {
        return "oak_log";
    } else if (item === "자작나무 원목(개당 150원)") {
        return "birch_log";
    } else if (item === "가문비나무 원목(개당 150원)") {
        return "spruce_log";
    } else if (item === "정글나무 원목(개당 180원)") {
        return "jungle_log";
    } else if (item === "아카시아나무 원목(개당 180원)") {
        return "acacia_log";
    }
    return ""; // 기본적으로 아이템 ID를 빈 문자열로 설정
}


//건축가게

function getbuildprice(item) {
    if (item === "석영(개당 200원)") {
        return 200; // 가격
    } else if (item === "벽돌(개당 200원)") {
        return 200; // 가격
    } else if (item === "점토(개당 200원)") {
        return 200; // 가격
    } else if (item === "모래(개당 150원)") {
        return 150; // 가격
    } else if (item === "자갈(개당 150원)") {
        return 150; // 가격
    }
    return 0; // 기본적으로 가격을 0으로 설정
}

// 건축가게 사장
export function build(player) {
    const formData = new ModalFormData();
    const list = ["석영(개당 200원)", "벽돌(개당 200원)", "점토(개당 200원)", "모래(개당 150원)", "자갈(개당 150원)"];
    formData.title('수입원목가게 사장');
    formData.dropdown("구매하실 물품을 선택하세요.", list)
    formData.slider(`구매하려는 수량을 설정하세요.`, 0, 256, 8);

    formData.show(player).then(response => {
        if (response.canceled) {
            return;
        } else {
            let item = list[response.formValues[0]]; // 선택된 아이템의 인덱스 사용
            let build_en = getbuilditemen(item); // 선택된 아이템에 따른 영문 아이템 ID 가져오기
            let price = getbuildprice(item); // 선택된 아이템에 따른 가격 가져오기

            const quantity = response.formValues[1]; // 선택된 수량 가져오기
            const totalPrice = quantity * price;

            player.runCommandAsync(`scoreboard players test @s money ${totalPrice}`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money ${totalPrice}`); // 돈 차감
                    player.runCommandAsync(`give @s ${build_en} ${quantity}`); // 아이템 주기
                    player.runCommandAsync(`title @s actionbar ${item} ${quantity}개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 선택된 아이템에 따른 영문 아이템 ID 가져오기
function getbuilditemen(item) {
    if (item === "석영(개당 200원)") {
        return "quartz";
    } else if (item === "벽돌(개당 200원)") {
        return "brick";
    } else if (item === "점토(개당 200원)") {
        return "clay_ball";
    } else if (item === "모래(개당 150원)") {
        return "sand";
    } else if (item === "자갈(개당 150원)") {
        return "gravel";
    }
    return ""; // 기본적으로 아이템 ID를 빈 문자열로 설정
}

// 음료가게 사장
export function drink(player) {
    const formData = new ActionFormData();

    formData.title('음료가게 사장').body('물과 그 첨가물들을 팔아요.');

    formData.button(`물병 64개 구매\n(20,000원)`);
    formData.button(`블레이즈 가루 1개 구매\n(200,000원)`);
    formData.button(`네더사마귀 1개 구매\n(200,000원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 20000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 20000`); // 돈 차감
                    player.runCommandAsync(`give @s potion 64`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 물병 64개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 1) {
            player.runCommandAsync(`scoreboard players test @s money 200000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 200000`); // 돈 차감
                    player.runCommandAsync(`give @s blaze_powder 1`); // 스테이크 주기
                    player.runCommandAsync(`title @s actionbar 블레이즈 가루 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        } else if (response.selection == 2) {
            player.runCommandAsync(`scoreboard players test @s money 200000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 200000`); // 돈 차감
                    player.runCommandAsync(`give @s nether_wart 1`); // 연어 주기
                    player.runCommandAsync(`title @s actionbar 네더사마귀 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

//레일가게
function getrailprice(item) {
    if (item === "일반레일(개당 350원)") {
        return 350; // 가격
    } else if (item === "파워레일(개당 15,000원)") {
        return 15000; // 가격
    }
    return 0; // 기본적으로 가격을 0으로 설정
}

// 레일가게 사장
export function rail(player) {
    const formData = new ModalFormData();
    const list = ["일반레일(개당 350원)", "파워레일(개당 15,000원)"];
    formData.title('책가게 사장');
    formData.dropdown("구매하실 물품을 선택하세요.", list)
    formData.slider(`구매하려는 수량을 설정하세요.`, 1, 64, 1);

    formData.show(player).then(response => {
        if (response.canceled) {
            return;
        } else {
            let item = list[response.formValues[0]]; // 선택된 아이템의 인덱스 사용
            let rail_en = getrailitemen(item); // 선택된 아이템에 따른 영문 아이템 ID 가져오기
            let price = getrailprice(item); // 선택된 아이템에 따른 가격 가져오기

            const quantity = response.formValues[1]; // 선택된 수량 가져오기
            const totalPrice = quantity * price;

            player.runCommandAsync(`scoreboard players test @s money ${totalPrice}`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money ${totalPrice}`); // 돈 차감
                    player.runCommandAsync(`give @s ${rail_en} ${quantity}`); // 아이템 주기
                    player.runCommandAsync(`title @s actionbar ${item} ${quantity}개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 선택된 아이템에 따른 영문 아이템 ID 가져오기
function getrailitemen(item) {
    if (item === "일반레일(개당 350원)") {
        return "rail";
    } else if (item === "파워레일(개당 15,000원)") {
        return "golden_rail";
    }
    return ""; // 기본적으로 아이템 ID를 빈 문자열로 설정
}

// 현대로템 사원
export function rotem(player) {
    const formData = new ActionFormData();

    formData.title('현대로템 사원').body('방위산업활동은 안해요.');

    formData.button(`마인카트 1개 구매\n(4,000원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 4000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 4000`); // 돈 차감
                    player.runCommandAsync(`give @s minecart 1`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 마인카트 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

// 스타벅스 사원
export function starbucks(player) {
    const formData = new ActionFormData();

    formData.title('스타벅스 사장').body('저 PC 아니에요. 그렇게 생겼지만요.');

    formData.button(`이름표 1개 구매\n(10,000원)`);

    formData.show(player).then(response => {
        if (response.canceled) return;


        if (response.selection == 0) {
            player.runCommandAsync(`scoreboard players test @s money 10000`).then(result => {
                if (result && result.successCount > 0) {
                    player.runCommandAsync(`scoreboard players remove @s money 10000`); // 돈 차감
                    player.runCommandAsync(`give @s name_tag 1`); // 재생 포션 주기
                    player.runCommandAsync(`title @s actionbar 이름표 1개 구매 완료`);
                } else {
                    player.sendMessage('금액이 부족합니다!');
                }
            });
        }
    });
};

//이 밑이 가장 하단으로 가도록 해야함!!!!

// 2틱마다 실행 (1틱 = 0.05초, 2틱 = 0.1초)
system.runInterval(() => { // runInterval을 사용해 반복
    const entities = world.getDimension("overworld").getEntities(); // overworld 차원에서 모든 엔티티 가져오기
    for (const entity of entities) { // 서버에 있는 모든 엔티티에 대해 반복
        const healthComponent = entity.getComponent("minecraft:health"); // 엔티티의 건강 컴포넌트를 가져옴
        if (healthComponent) { // 건강 컴포넌트가 있다면
            const entityHp = healthComponent.currentValue.toFixed(1); // 엔티티의 현재 HP (소수점 첫째 자리까지)
            const entityMaxHp = healthComponent.effectiveMax.toFixed(1); // 엔티티의 최대 HP (소수점 첫째 자리까지)
            entity.nameTag = ``; // 엔티티의 네임태그 설정
        }
    }
}, 2); // 워치독 방지를 위해 2틱마다 실행

// 일정 간격으로 플레이어 칭호 업데이트 함수를 실행 (2 틱마다 실행)
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        const guildName = getPlayerGuild(player.name);
        const playerHp = Math.round(player.getComponent("minecraft:health").currentValue);
        const playerMaxHp = player.getComponent("minecraft:health").effectiveMax//플레이어 최대 Hp
        const rank = player.getDynamicProperty(`rank`)
        let osicon = (player.clientSystemInfo.platformType === "Mobile") ? "§l§b[Mobile] " : "§l§b[PC] ";
        if (guildName) {
            if (typeof rank == "undefined") {
                player.nameTag = `§l§6[${guildName}]` + "\n" + osicon + "[ 뉴비 ] " + "\n" + player.name + "\n" + playerHp + "/" + playerMaxHp
            } else {
                player.nameTag = `§l§6[${guildName}]` + "\n" + osicon + "§a§l[" + rank + "]" + "\n" + player.name + "\n" + playerHp + "/" + playerMaxHp
            }
        } else {
            if (typeof rank == "undefined") {
                player.nameTag = osicon + "[ 뉴비 ] " + "\n" + player.name + "\n" + playerHp + "/" + playerMaxHp
            } else {
                player.nameTag = osicon + "§a§l[" + rank + "]" + "\n" + player.name + "\n" + playerHp + "/" + playerMaxHp
            }
        }



        if (player.hasTag("izakaya")) {
            izakaya(player)
            // 태그 제거
            player.removeTag("izakaya");
        }

        if (player.hasTag("yakitori")) {
            yakitori(player)
            // 태그 제거
            player.removeTag("yakitori");
        }

        if (player.hasTag("unique")) {
            unique(player)
            // 태그 제거
            player.removeTag("unique");
        }

        if (player.hasTag("firework")) {
            firework(player)
            // 태그 제거
            player.removeTag("firework");
        }

        if (player.hasTag("chinese")) {
            chinese(player)
            // 태그 제거
            player.removeTag("chinese");
        }

        if (player.hasTag("chuksan")) {
            chuksan(player)
            // 태그 제거
            player.removeTag("chuksan");
        }

        if (player.hasTag("american")) {
            american(player)
            // 태그 제거
            player.removeTag("american");
        }

        if (player.hasTag("golddiamond")) {
            golddiamond(player)
            // 태그 제거
            player.removeTag("golddiamond");
        }

        if (player.hasTag("machine")) {
            machine(player)
            // 태그 제거
            player.removeTag("machine");
        }

        if (player.hasTag("electric")) {
            electric(player)
            // 태그 제거
            player.removeTag("electric");
        }

        if (player.hasTag("bookstore")) {
            bookstore(player)
            // 태그 제거
            player.removeTag("bookstore");
        }

        if (player.hasTag("wood")) {
            wood(player)
            // 태그 제거
            player.removeTag("wood");
        }

        if (player.hasTag("build")) {
            build(player)
            // 태그 제거
            player.removeTag("build");
        }

        if (player.hasTag("drink")) {
            drink(player)
            // 태그 제거
            player.removeTag("drink");
        }

        if (player.hasTag("rail")) {
            rail(player)
            // 태그 제거
            player.removeTag("rail");
        }

        if (player.hasTag("rotem")) {
            rotem(player)
            // 태그 제거
            player.removeTag("rotem");
        }

        if (player.hasTag("starbucks")) {
            starbucks(player)
            // 태그 제거
            player.removeTag("starbucks");
        }
    }
}, 2)//위치독 방지를 위해 2틱마다 실행

//이 위가 가장 하단으로 가도록 해야함!!!!

// 금지된 영역의 최소 및 최대 좌표 설정
const restrictedRegion = {
    min: { x: 16, y: 40, z: -29 },  // 최소 좌표
    max: { x: 117, y: 150, z: 58 }   // 최대 좌표
};

// 위치가 금지된 영역 안에 있는지 확인하는 함수
function isInRestrictedRegion(x, y, z) {
    return (
        x >= restrictedRegion.min.x && x <= restrictedRegion.max.x &&
        y >= restrictedRegion.min.y && y <= restrictedRegion.max.y &&
        z >= restrictedRegion.min.z && z <= restrictedRegion.max.z
    );
}

// 플레이어가 블록을 파괴할 때 발생하는 이벤트
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const player = ev.player;
    const { x, y, z } = ev.block.location;

    // 오버월드에서만 금지 영역 적용
    if (player.dimension.id === "minecraft:overworld" && isInRestrictedRegion(x, y, z) && !player.isOp()) {
        ev.cancel = true;
        player.sendMessage(`§c중앙마을 영역에서는 블록을 파괴할 수 없습니다.`);
    }
});

// 플레이어가 블록을 설치할 때 발생하는 이벤트
world.beforeEvents.playerPlaceBlock.subscribe((ev) => {
    const player = ev.player;
    const { x, y, z } = ev.block.location;

    // 오버월드에서만 금지 영역 적용
    if (player.dimension.id === "minecraft:overworld" && isInRestrictedRegion(x, y, z) && !player.isOp()) {
        ev.cancel = true;
        player.sendMessage(`§c중앙마을 영역에서는 블록을 설치할 수 없습니다.`);
    }
});
