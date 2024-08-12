/*
 * The KeyboardAvoidingView is only used on ios
 */
import React from 'react';
import {View} from 'react-native';
import type {KeyboardAvoidingViewProps} from './types';
import {UNMASK} from '@libs/Fullstory';

function KeyboardAvoidingView(props: KeyboardAvoidingViewProps) {
    const {behavior, contentContainerStyle, enabled, keyboardVerticalOffset, ...rest} = props;
    return (
        // eslint-disable-next-line react/jsx-props-no-spreading
        <View fsClass={UNMASK} {...rest} />
    );
}

KeyboardAvoidingView.displayName = 'KeyboardAvoidingView';

export default KeyboardAvoidingView;
