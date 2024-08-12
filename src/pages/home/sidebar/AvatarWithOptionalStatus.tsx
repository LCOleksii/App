import React from 'react';
import {View} from 'react-native';
import Text from '@components/Text';
import useThemeStyles from '@hooks/useThemeStyles';
import {UNMASK} from '@libs/Fullstory';
import ProfileAvatarWithIndicator from './ProfileAvatarWithIndicator';

type AvatarWithOptionalStatusProps = {
    /** Emoji status */
    emojiStatus?: string;

    /** Whether the avatar is selected */
    isSelected?: boolean;
};

function AvatarWithOptionalStatus({emojiStatus = '', isSelected = false}: AvatarWithOptionalStatusProps) {
    const styles = useThemeStyles();

    return (
        <View
            fsClass={UNMASK}
            style={styles.sidebarStatusAvatarContainer}
        >
            <ProfileAvatarWithIndicator isSelected={isSelected} />
            <View fsClass={UNMASK} style={[styles.sidebarStatusAvatar]}>
                <View fsClass={UNMASK}>
                    <Text
                        style={styles.emojiStatusLHN}
                        numberOfLines={1}
                    >
                        {emojiStatus}
                    </Text>
                </View>
            </View>
        </View>
    );
}

AvatarWithOptionalStatus.displayName = 'AvatarWithOptionalStatus';

export default AvatarWithOptionalStatus;
