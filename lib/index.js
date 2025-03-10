import React, { PureComponent } from 'react';
import { Animated, Easing, I18nManager, Image, PanResponder, View, } from 'react-native';
// styles
import { defaultStyles as styles } from './styles';
const Rect = ({ height, width, x, y, }) => ({
    containsPoint: (nativeX, nativeY) => nativeX >= x &&
        nativeY >= y &&
        nativeX <= x + width &&
        nativeY <= y + height,
    height,
    trackDistanceToPoint: (nativeX) => {
        if (nativeX < x) {
            return x - nativeX;
        }
        if (nativeX > x + width) {
            return nativeX - (x + width);
        }
        return 0;
    },
    width,
    x,
    y,
});
const DEFAULT_ANIMATION_CONFIGS = {
    spring: {
        friction: 7,
        tension: 100,
    },
    timing: {
        duration: 150,
        easing: Easing.inOut(Easing.ease),
        delay: 0,
    },
};
const normalizeValue = (props, value) => {
    if (!value || (Array.isArray(value) && value.length === 0)) {
        return [0];
    }
    const { maximumValue, minimumValue } = props;
    const getBetweenValue = (inputValue) => Math.max(Math.min(inputValue, maximumValue), minimumValue);
    if (!Array.isArray(value)) {
        return [getBetweenValue(value)];
    }
    return value.map(getBetweenValue).sort((a, b) => a - b);
};
const updateValues = ({ values, newValues = values, }) => {
    if (Array.isArray(newValues) &&
        Array.isArray(values) &&
        newValues.length !== values.length) {
        return updateValues({ values: newValues });
    }
    if (Array.isArray(values) && Array.isArray(newValues)) {
        return values?.map((value, index) => {
            let valueToSet = newValues[index];
            if (value instanceof Animated.Value) {
                if (valueToSet instanceof Animated.Value) {
                    valueToSet = valueToSet.__getValue();
                }
                value.setValue(valueToSet);
                return value;
            }
            if (valueToSet instanceof Animated.Value) {
                return valueToSet;
            }
            return new Animated.Value(valueToSet);
        });
    }
    return [new Animated.Value(0)];
};
const indexOfLowest = (values) => {
    let lowestIndex = 0;
    values.forEach((value, index, array) => {
        if (value < array[lowestIndex]) {
            lowestIndex = index;
        }
    });
    return lowestIndex;
};
export class Slider extends PureComponent {
    constructor(props) {
        super(props);
        this._panResponder = PanResponder.create({
            onStartShouldSetPanResponder: this._handleStartShouldSetPanResponder,
            onMoveShouldSetPanResponder: this._handleMoveShouldSetPanResponder,
            onPanResponderGrant: this._handlePanResponderGrant,
            onPanResponderMove: this._handlePanResponderMove,
            onPanResponderRelease: this._handlePanResponderEnd,
            onPanResponderTerminationRequest: this._handlePanResponderRequestEnd,
            onPanResponderTerminate: this._handlePanResponderEnd,
        });
        this.state = {
            allMeasured: false,
            containerSize: {
                width: 0,
                height: 0,
            },
            thumbSize: {
                width: 0,
                height: 0,
            },
            trackMarksValues: updateValues({
                values: normalizeValue(this.props, this.props.trackMarks),
            }),
            values: updateValues({
                values: normalizeValue(this.props, this.props.value instanceof Animated.Value
                    ? this.props.value.__getValue()
                    : this.props.value),
            }),
        };
    }
    static defaultProps = {
        animationType: 'timing',
        debugTouchArea: false,
        trackMarks: [],
        maximumTrackTintColor: '#b3b3b3',
        maximumValue: 1,
        minimumTrackTintColor: '#3f3f3f',
        minimumValue: 0,
        step: 0,
        thumbTintColor: '#343434',
        trackClickable: true,
        value: 0,
        vertical: false,
        startFromZero: false,
    };
    static getDerivedStateFromProps(props, state) {
        if (props.trackMarks &&
            !!state.trackMarksValues &&
            state.trackMarksValues.length > 0) {
            const newTrackMarkValues = normalizeValue(props, props.trackMarks);
            const statePatch = {};
            if (state.trackMarksValues) {
                statePatch.trackMarksValues = updateValues({
                    values: state.trackMarksValues,
                    newValues: newTrackMarkValues,
                });
            }
            return statePatch;
        }
    }
    componentDidUpdate(prevProps) {
        // Check if the value prop has changed
        if (this.props.value !== prevProps.value) {
            // @ts-ignore
            const newValues = normalizeValue(this.props, this.props.value);
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({
                values: updateValues({
                    values: this.state.values,
                    newValues: newValues,
                }),
            }, () => {
                newValues.forEach((value, i) => {
                    // @ts-ignore
                    const currentValue = this.state.values[i].__getValue();
                    if (value !== currentValue &&
                        this.props.animateTransitions) {
                        this._setCurrentValueAnimated(value, i);
                    }
                    else {
                        this._setCurrentValue(value, i);
                    }
                });
            });
        }
        // Check for other prop changes that might require state updates, e.g., trackMarks
        if (this.props.trackMarks !== prevProps.trackMarks) {
            const newTrackMarksValues = normalizeValue(this.props, this.props.trackMarks);
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({
                trackMarksValues: updateValues({
                    // @ts-ignore
                    values: this.state.trackMarksValues,
                    newValues: newTrackMarksValues,
                }),
            });
        }
    }
    _getRawValues(values) {
        return values.map((value) => value.__getValue());
    }
    _handleStartShouldSetPanResponder = (e) => this._thumbHitTest(e); // Should we become active when the user presses down on the thumb?
    _handleMoveShouldSetPanResponder() {
        // Should we become active when the user moves a touch over the thumb?
        return false;
    }
    _handlePanResponderGrant = (e) => {
        const { thumbSize } = this.state;
        const { nativeEvent } = e;
        this._previousLeft = this.props.trackClickable
            ? nativeEvent.locationX - thumbSize.width
            : this._getThumbLeft(this._getCurrentValue(this._activeThumbIndex));
        if (this.props.thumbTouchSize) {
            this._previousLeft -=
                (this.props.thumbTouchSize.width - thumbSize.width) / 2;
        }
        this.props?.onSlidingStart?.(this._getRawValues(this.state.values), this._activeThumbIndex);
    };
    _handlePanResponderMove = (_e, gestureState) => {
        if (this.props.disabled) {
            return;
        }
        this._setCurrentValue(this._getValue(gestureState), this._activeThumbIndex, () => {
            this.props?.onValueChange?.(this._getRawValues(this.state.values), this._activeThumbIndex);
        });
    };
    _handlePanResponderRequestEnd = () => /* e, gestureState: GestureState */ {
        // Should we allow another component to take over this pan?
        return false;
    };
    _handlePanResponderEnd = (_e, gestureState) => {
        if (this.props.disabled) {
            return;
        }
        this._setCurrentValue(this._getValue(gestureState), this._activeThumbIndex, () => {
            if (this.props.trackClickable) {
                this.props?.onValueChange?.(this._getRawValues(this.state.values), this._activeThumbIndex);
            }
            this.props?.onSlidingComplete?.(this._getRawValues(this.state.values), this._activeThumbIndex);
        });
        this._activeThumbIndex = 0;
    };
    _measureContainer = (e) => {
        this._handleMeasure('_containerSize', e);
    };
    _measureTrack = (e) => {
        this._handleMeasure('_trackSize', e);
    };
    _measureThumb = (e) => {
        this._handleMeasure('_thumbSize', e);
    };
    _handleMeasure = (name, e) => {
        const { width, height } = e.nativeEvent.layout;
        const size = {
            width,
            height,
        };
        const currentSize = this[name];
        if (currentSize &&
            width === currentSize.width &&
            height === currentSize.height) {
            return;
        }
        this[name] = size;
        if (this._containerSize && this._thumbSize) {
            this.setState({
                containerSize: this._containerSize,
                thumbSize: this._thumbSize,
                allMeasured: true,
            });
        }
    };
    _getRatio = (value) => {
        const { maximumValue, minimumValue } = this.props;
        return (value - minimumValue) / (maximumValue - minimumValue);
    };
    _getThumbLeft = (value) => {
        const { containerSize, thumbSize } = this.state;
        const { vertical } = this.props;
        const standardRatio = this._getRatio(value);
        const ratio = I18nManager.isRTL ? 1 - standardRatio : standardRatio;
        return (ratio *
            ((vertical ? containerSize.height : containerSize.width) -
                thumbSize.width));
    };
    _getValue = (gestureState) => {
        const { containerSize, thumbSize, values } = this.state;
        const { maximumValue, minimumValue, step, vertical } = this.props;
        const length = containerSize.width - thumbSize.width;
        const thumbLeft = vertical
            ? this._previousLeft + gestureState.dy * -1
            : this._previousLeft + gestureState.dx;
        const nonRtlRatio = thumbLeft / length;
        const ratio = I18nManager.isRTL ? 1 - nonRtlRatio : nonRtlRatio;
        let minValue = minimumValue;
        let maxValue = maximumValue;
        const rawValues = this._getRawValues(values);
        const buffer = step ? step : 0.1;
        if (values.length === 2) {
            if (this._activeThumbIndex === 1) {
                minValue = rawValues[0] + buffer;
            }
            else {
                maxValue = rawValues[1] - buffer;
            }
        }
        if (step) {
            return Math.max(minValue, Math.min(maxValue, minimumValue +
                Math.round((ratio * (maximumValue - minimumValue)) / step) *
                    step));
        }
        return Math.max(minValue, Math.min(maxValue, ratio * (maximumValue - minimumValue) + minimumValue));
    };
    _getCurrentValue = (thumbIndex = 0) => this.state.values[thumbIndex].__getValue();
    _setCurrentValue = (value, thumbIndex, callback) => {
        const safeIndex = thumbIndex ?? 0;
        const animatedValue = this.state.values[safeIndex];
        if (animatedValue) {
            animatedValue.setValue(value);
            if (callback) {
                callback();
            }
        }
        else {
            this.setState((prevState) => {
                const newValues = [...prevState.values];
                newValues[safeIndex] = new Animated.Value(value);
                return {
                    values: newValues,
                };
            }, callback);
        }
    };
    _setCurrentValueAnimated = (value, thumbIndex = 0) => {
        const { animationType } = this.props;
        const animationConfig = {
            ...DEFAULT_ANIMATION_CONFIGS[animationType],
            ...this.props.animationConfig,
            toValue: value,
            useNativeDriver: false,
        };
        Animated[animationType](this.state.values[thumbIndex], animationConfig).start();
    };
    _getTouchOverflowSize = () => {
        const { allMeasured, containerSize, thumbSize } = this.state;
        const { thumbTouchSize } = this.props;
        const size = {
            width: 40,
            height: 40,
        };
        if (allMeasured) {
            size.width = Math.max(0, thumbTouchSize?.width || 0 + thumbSize.width);
            size.height = Math.max(0, thumbTouchSize?.height || 0 - containerSize.height);
        }
        return size;
    };
    _getTouchOverflowStyle = () => {
        const { width, height } = this._getTouchOverflowSize();
        const touchOverflowStyle = {};
        if (width !== undefined && height !== undefined) {
            const verticalMargin = -height / 2;
            touchOverflowStyle.marginTop = verticalMargin;
            touchOverflowStyle.marginBottom = verticalMargin;
            const horizontalMargin = -width / 2;
            touchOverflowStyle.marginLeft = horizontalMargin;
            touchOverflowStyle.marginRight = horizontalMargin;
        }
        if (this.props.debugTouchArea === true) {
            touchOverflowStyle.backgroundColor = 'orange';
            touchOverflowStyle.opacity = 0.5;
        }
        return touchOverflowStyle;
    };
    _thumbHitTest = (e) => {
        const { nativeEvent } = e;
        const { trackClickable } = this.props;
        const { values } = this.state;
        const hitThumb = values.find((_, i) => {
            const thumbTouchRect = this._getThumbTouchRect(i);
            const containsPoint = thumbTouchRect.containsPoint(nativeEvent.locationX, nativeEvent.locationY);
            if (containsPoint) {
                this._activeThumbIndex = i;
            }
            return containsPoint;
        });
        if (hitThumb) {
            return true;
        }
        if (trackClickable) {
            // set the active thumb index
            if (values.length === 1) {
                this._activeThumbIndex = 0;
            }
            else {
                // we will find the closest thumb and that will be the active thumb
                const thumbDistances = values.map((_value, index) => {
                    const thumbTouchRect = this._getThumbTouchRect(index);
                    return thumbTouchRect.trackDistanceToPoint(nativeEvent.locationX);
                });
                this._activeThumbIndex = indexOfLowest(thumbDistances);
            }
            return true;
        }
        return false;
    };
    _getThumbTouchRect = (thumbIndex = 0) => {
        const { containerSize, thumbSize } = this.state;
        const { thumbTouchSize } = this.props;
        const { height, width } = thumbTouchSize || { height: 40, width: 40 };
        const touchOverflowSize = this._getTouchOverflowSize();
        return Rect({
            height,
            width,
            x: touchOverflowSize.width / 2 +
                this._getThumbLeft(this._getCurrentValue(thumbIndex)) +
                (thumbSize.width - width) / 2,
            y: touchOverflowSize.height / 2 +
                (containerSize.height - height) / 2,
        });
    };
    _activeThumbIndex = 0;
    _containerSize;
    _panResponder;
    _previousLeft = 0;
    _thumbSize;
    _trackSize;
    _renderDebugThumbTouchRect = (thumbLeft, index) => {
        const { height, x, y, width } = this._getThumbTouchRect() || {};
        const positionStyle = {
            height,
            left: x,
            top: y,
            width,
        };
        return (React.createElement(Animated.View, { key: `debug-thumb-${index}`, pointerEvents: "none", style: [styles.debugThumbTouchArea, positionStyle] }));
    };
    _renderThumbImage = (thumbIndex = 0) => {
        const { thumbImage } = this.props;
        if (!thumbImage) {
            return null;
        }
        return (React.createElement(Image, { source: (Array.isArray(thumbImage)
                ? thumbImage[thumbIndex]
                : thumbImage) }));
    };
    render() {
        const { containerStyle, debugTouchArea, maximumTrackTintColor, maximumValue, minimumTrackTintColor, minimumValue, renderAboveThumbComponent, renderBelowThumbComponent, renderTrackMarkComponent, renderThumbComponent, renderMinimumTrackComponent, renderMaximumTrackComponent, thumbStyle, thumbTintColor, trackStyle, minimumTrackStyle: propMinimumTrackStyle, maximumTrackStyle: propMaximumTrackStyle, vertical, startFromZero, step = 0, trackRightPadding, ...other } = this.props;
        const { allMeasured, containerSize, thumbSize, trackMarksValues, values, } = this.state;
        const rightPadding = trackRightPadding ?? thumbSize.width;
        const _startFromZero = values.length === 1 && minimumValue < 0 && maximumValue > 0
            ? startFromZero
            : false;
        const interpolatedThumbValues = values.map((value) => value.interpolate({
            inputRange: [minimumValue, maximumValue],
            outputRange: I18nManager.isRTL
                ? [0, -(containerSize.width - rightPadding)]
                : [0, containerSize.width - rightPadding],
        }));
        const interpolatedTrackValues = values.map((value) => value.interpolate({
            inputRange: [minimumValue, maximumValue],
            outputRange: [0, containerSize.width - rightPadding],
        }));
        const interpolatedTrackMarksValues = trackMarksValues &&
            trackMarksValues.map((v) => v.interpolate({
                inputRange: [minimumValue, maximumValue],
                outputRange: I18nManager.isRTL
                    ? [0, -(containerSize.width - rightPadding)]
                    : [0, containerSize.width - rightPadding],
            }));
        const valueVisibleStyle = {};
        if (!allMeasured) {
            valueVisibleStyle.opacity = 0;
        }
        const _value = values[0].__getValue();
        const sliderWidthCoefficient = containerSize.width /
            (Math.abs(minimumValue) + Math.abs(maximumValue));
        const startPositionOnTrack = _startFromZero
            ? _value < 0 + step
                ? (_value + Math.abs(minimumValue)) * sliderWidthCoefficient
                : Math.abs(minimumValue) * sliderWidthCoefficient
            : 0;
        const minTrackWidth = _startFromZero
            ? Math.abs(_value) * sliderWidthCoefficient - thumbSize.width / 2
            : interpolatedTrackValues[0];
        const maxTrackWidth = interpolatedTrackValues[1];
        const clearBorderRadius = {};
        if (_startFromZero && _value < 0 + step) {
            clearBorderRadius.borderBottomRightRadius = 0;
            clearBorderRadius.borderTopRightRadius = 0;
        }
        if (_startFromZero && _value > 0) {
            clearBorderRadius.borderTopLeftRadius = 0;
            clearBorderRadius.borderBottomLeftRadius = 0;
        }
        const minimumTrackStyle = {
            position: 'absolute',
            left: interpolatedTrackValues.length === 1
                ? new Animated.Value(startPositionOnTrack)
                : Animated.add(minTrackWidth, thumbSize.width / 2),
            width: interpolatedTrackValues.length === 1
                ? Animated.add(minTrackWidth, thumbSize.width / 2)
                : Animated.add(Animated.multiply(minTrackWidth, -1), maxTrackWidth),
            backgroundColor: minimumTrackTintColor,
            ...valueVisibleStyle,
            ...clearBorderRadius,
        };
        const touchOverflowStyle = this._getTouchOverflowStyle();
        return (React.createElement(React.Fragment, null,
            renderAboveThumbComponent && (React.createElement(View, { style: styles.aboveThumbComponentsContainer }, interpolatedThumbValues.map((interpolationValue, i) => {
                const animatedValue = values[i] || 0;
                const value = animatedValue instanceof Animated.Value
                    ? animatedValue.__getValue()
                    : animatedValue;
                return (React.createElement(Animated.View, { key: `slider-above-thumb-${i}`, style: [
                        styles.renderThumbComponent,
                        {
                            bottom: 0,
                            left: thumbSize.width / 2,
                            transform: [
                                {
                                    translateX: interpolationValue,
                                },
                                {
                                    translateY: 0,
                                },
                            ],
                            ...valueVisibleStyle,
                        },
                    ] }, renderAboveThumbComponent(i, value)));
            }))),
            React.createElement(View, { ...other, style: [
                    styles.container,
                    vertical ? { transform: [{ rotate: '-90deg' }] } : {},
                    containerStyle,
                ], onLayout: this._measureContainer },
                React.createElement(View, { renderToHardwareTextureAndroid: true, style: [
                        styles.track,
                        {
                            backgroundColor: maximumTrackTintColor,
                        },
                        trackStyle,
                        propMaximumTrackStyle,
                    ], onLayout: this._measureTrack }, renderMaximumTrackComponent
                    ? renderMaximumTrackComponent()
                    : null),
                React.createElement(Animated.View, { renderToHardwareTextureAndroid: true, style: [
                        styles.track,
                        trackStyle,
                        minimumTrackStyle,
                        propMinimumTrackStyle,
                    ] }, renderMinimumTrackComponent
                    ? renderMinimumTrackComponent()
                    : null),
                renderTrackMarkComponent &&
                    interpolatedTrackMarksValues &&
                    interpolatedTrackMarksValues.map((value, i) => (React.createElement(Animated.View, { key: `track-mark-${i}`, style: [
                            styles.renderThumbComponent,
                            {
                                transform: [
                                    {
                                        translateX: value,
                                    },
                                    {
                                        translateY: 0,
                                    },
                                ],
                                ...valueVisibleStyle,
                            },
                        ] }, renderTrackMarkComponent(i)))),
                interpolatedThumbValues.map((value, i) => (React.createElement(Animated.View, { key: `slider-thumb-${i}`, style: [
                        renderThumbComponent
                            ? styles.renderThumbComponent
                            : styles.thumb,
                        renderThumbComponent
                            ? {}
                            : {
                                width: 12,
                                height: 18,
                                borderTopLeftRadius: i == 0 ? 12 : 0,
                                borderTopRightRadius: i == 0 ? 0 : 12,
                                borderBottomLeftRadius: i == 0 ? 12 : 0,
                                borderBottomRightRadius: i == 0 ? 0 : 12,
                                backgroundColor: thumbTintColor,
                                ...thumbStyle,
                            },
                        {
                            transform: [
                                {
                                    translateX: this.props.isRangeSlider
                                        ? i === 0
                                            ? Animated.add(value, new Animated.Value(-5))
                                            : Animated.add(value, new Animated.Value(5))
                                        : value,
                                },
                                {
                                    translateY: 0,
                                },
                            ],
                            ...valueVisibleStyle,
                        },
                    ], onLayout: this._measureThumb }, renderThumbComponent
                    ? Array.isArray(renderThumbComponent)
                        ? renderThumbComponent[i](i)
                        : renderThumbComponent(i)
                    : this._renderThumbImage(i)))),
                React.createElement(View, { style: [styles.touchArea, touchOverflowStyle], ...this._panResponder.panHandlers }, !!debugTouchArea &&
                    interpolatedThumbValues.map((value, i) => this._renderDebugThumbTouchRect(value, i)))),
            renderBelowThumbComponent && (React.createElement(View, { style: styles.belowThumbComponentsContainer }, interpolatedThumbValues.map((interpolationValue, i) => {
                const animatedValue = values[i] || 0;
                const value = animatedValue instanceof Animated.Value
                    ? animatedValue.__getValue()
                    : animatedValue;
                return (React.createElement(Animated.View, { key: `slider-below-thumb-${i}`, style: [
                        styles.renderThumbComponent,
                        {
                            top: 0,
                            left: thumbSize.width / 2,
                            transform: [
                                {
                                    translateX: interpolationValue,
                                },
                                {
                                    translateY: 0,
                                },
                            ],
                            ...valueVisibleStyle,
                        },
                    ] }, renderBelowThumbComponent(i, value)));
            })))));
    }
}
//# sourceMappingURL=index.js.map