import { render } from 'preact'
import './index.scss'
import { Timer } from '../components/timer/timer'
import 'preact/debug'

render(<Timer />, document.getElementById('app'))
